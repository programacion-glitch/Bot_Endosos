import { Page } from 'playwright';
import { AddLossPayeeCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import {
  ok,
  fail,
  waitForSaveConfirmation,
  todayYYYYMMdd,
  safeFilenamePart,
  escapeRegex,
  getInsuredUrl,
  parseUSAddress,
  toFullStateName,
} from './_base';
import { downloadCertificate } from './_holderHelpers';
import { selectRadComboByText } from './_policyHelpers';

/**
 * ADD LOSS PAYEE TO VIN#
 * Flujo CORRECTO (vía el vehículo, NO desde Additional Interests):
 * 1. Vehicles list
 * 2. Fila del VIN -> Actions -> Lien Holders (expande inline)
 * 3. Click <a href="/CertificateHolders/Insert.aspx?VehicleId=..."> (NO el "+ Add New" del grid de vehículos)
 * 4. Se abre el form ASPX legacy de Certificate Holder
 * 5. Fill holder + dirección, desmarcar Additional Insured, marcar Loss Payee, escribir nota
 * 6. Save (#btnInsert_input)
 * 7. Volver a Vehicles -> Actions -> Lien Holders -> Actions -> Send Certificate -> download
 */
export async function addLossPayee(page: Page, cmd: AddLossPayeeCommand): Promise<ActionResult> {
  logger.info(`addLossPayee: VIN=${cmd.vin} holder="${cmd.holder.name}"`);

  try {
    // 1-3. Navegar al insert del Lien Holder para este VIN
    await openLienHolderInsert(page, cmd.vin);

    // 4a. Intentar primero ubicar un holder existente por nombre. Si lo
    //     encuentra, NowCerts navega automáticamente a /CertificateHolders/Edit.aspx
    //     con el holder ya vinculado al vehículo (no hay que llenar nombre/dirección).
    const foundExisting = await tryFindExistingHolder(page, cmd.holder.name, cmd.holder.address);
    if (foundExisting) {
      logger.info(`addLossPayee: holder existente encontrado y seleccionado → modo Edit`);
      // Esperar a que la página de Edit cargue y el form esté listo
      await page.waitForURL(/\/CertificateHolders\/Edit\.aspx/i, { timeout: 20_000 }).catch(() => {});
      await page.waitForSelector('#cblAdditionalInterests_5', { state: 'visible', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // Solo marcar checkboxes + pólizas + nota (nombre y dirección ya vienen del holder)
      await fillLegacyLienHolderForm(page, cmd.holder, /* skipContactsAndAddress */ true);
    } else {
      logger.info(`addLossPayee: no se encontró holder existente, creando nuevo`);
      // 4b. Llenar el formulario ASPX legacy completo (Insert)
      await fillLegacyLienHolderForm(page, cmd.holder, /* skipContactsAndAddress */ false);
    }

    // 6. Save — detectar si estamos en Insert (#btnInsert_input, value="Add")
    //    o en Edit (#btnUpdate_input, value="Update")
    const saveBtnLocator = foundExisting
      ? page.locator('#btnUpdate_input').first()
      : page.locator('#btnInsert_input').first();
    await saveBtnLocator.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await saveBtnLocator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await saveBtnLocator.click({ force: true });
    await waitForSaveConfirmation(page).catch(() => {});
    await page.waitForTimeout(4000);

    // 7. Volver a la grilla de Lien Holders del vehículo para descargar certificado
    await openLienHoldersForVin(page, cmd.vin);

    // Espera adicional de 15s para que NowCerts actualice los datos del holder
    // recién creado/actualizado antes de generar el certificado (evita certs con data vacía).
    logger.info('addLossPayee: esperando 15s antes de descargar certificado para que el holder se propague...');
    await page.waitForTimeout(15_000);

    const last4vin = cmd.vin.slice(-4);
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder & LP VIN# ${last4vin} (${safeFilenamePart(cmd.holder.name)}).pdf`;
    // Pasar cmd.vin para que en el Send Certificate solo quede marcado ese vehículo
    // (los drivers se marcan todos).
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note, cmd.vin).catch(err => {
      logger.warn(`downloadCertificate not completed: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_LOSS_PAYEE', `Loss Payee added for VIN ${cmd.vin}`, files);
  } catch (err) {
    return fail('ADD_LOSS_PAYEE', (err as Error).message, err as Error);
  }
}

/**
 * Navega a Vehicles, encuentra la fila del VIN y abre la sección Lien Holders
 * inline (Actions -> Lien Holders).
 */
async function openLienHoldersForVin(page: Page, vin: string): Promise<void> {
  const vehiclesUrl = getInsuredUrl(page, 'Vehicles');
  await page.goto(vehiclesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const vehicleRow = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(vin), 'i') }).first();
  const rowCount = await vehicleRow.count();
  if (rowCount === 0) {
    throw new Error(`Vehicle row not found for VIN: ${vin}`);
  }
  await vehicleRow.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.locator('li.k-item, span, a').filter({ hasText: /^\s*Lien\s*Holders\s*$/i }).first().click({ force: true });
  await page.waitForTimeout(2500);
}

/**
 * Abre el insert ASPX de Certificate Holder vinculado al VIN actual.
 * Navega a Vehicles -> Actions -> Lien Holders (expande inline) y sigue el
 * link `Add` cuyo href apunta a `/CertificateHolders/Insert.aspx?VehicleId=...`
 * (NO el `+ Add New` de la grilla de vehículos).
 */
async function openLienHolderInsert(page: Page, vin: string): Promise<void> {
  await openLienHoldersForVin(page, vin);

  // El link correcto es el <a> cuyo href apunta a CertificateHolders/Insert.aspx con VehicleId
  const addLink = page.locator('a[href*="/CertificateHolders/Insert.aspx"][href*="VehicleId="]').first();
  await addLink.waitFor({ state: 'visible', timeout: 15_000 });
  // Usar la propiedad `.href` (absoluta) en vez del atributo (puede ser relativa).
  const absoluteHref = await addLink.evaluate((el: any) => el.href as string).catch(() => '');
  if (absoluteHref && /^https?:\/\//i.test(absoluteHref)) {
    await page.goto(absoluteHref, { waitUntil: 'domcontentloaded' });
  } else {
    await addLink.scrollIntoViewIfNeeded().catch(() => {});
    await addLink.click({ force: true });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  // Esperar a que el form ASPX esté listo (usamos el Company Name como señal)
  await page.waitForSelector('#ContentPlaceHolder1_FormView1_ctl02_ctl00___Name_TextBox1', { state: 'visible', timeout: 20_000 });
  // Esperar a que iCheck termine de envolver los checkboxes (insertan wrappers en
  // paralelo al DOM ready, así que hay que darle un margen al plugin).
  await page.waitForFunction(
    () => {
      const doc = (globalThis as any).document;
      const cb = doc?.getElementById?.('cblAdditionalInterests_5');
      return !!cb?.parentElement?.classList?.toString?.().match(/icheckbox/i)
        || !!cb?.closest?.('.icheckbox, [class*="icheckbox_"]');
    },
    null,
    { timeout: 15_000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Llena el formulario ASPX legacy `/CertificateHolders/Insert.aspx` (o `/Edit.aspx`).
 * NO usa los selectores Angular de searchOrCreateHolder — ese form vive en otro URL.
 *
 * @param skipContactsAndAddress Cuando es true, omite Company Name + dirección
 *   (el holder ya existía y fue seleccionado via search — esos campos ya están
 *   pre-llenados). Solo llena checkboxes, póliza y nota.
 */
async function fillLegacyLienHolderForm(
  page: Page,
  holder: { name: string; address?: string; note?: string },
  skipContactsAndAddress = false
): Promise<void> {
  if (!skipContactsAndAddress) {
    // Company Name
    const nameField = page.locator('#ContentPlaceHolder1_FormView1_ctl02_ctl00___Name_TextBox1').first();
    await nameField.fill(holder.name);

    // Address parsing
    const { line1, city, state, zip } = parseUSAddress(holder.address ?? '');

    if (line1) {
      const addr1 = page.locator('#ContentPlaceHolder1_FormView1_ctl02_ctl06___AddressLine1_TextBox1').first();
      await addr1.fill(line1);
      // Cerrar el autocompletado de Google Maps ("Introduce una ubicación")
      await page.keyboard.press('Escape').catch(() => {});
    }
    if (city) {
      await page.locator('#ContentPlaceHolder1_FormView1_ctl02_ctl08___City_TextBox1').first().fill(city);
    }
    if (state) {
      await selectRadComboByText(
        page,
        '#ctl00_ContentPlaceHolder1_FormView1_ctl02_ctl09___StateId_usrState_ddlStates_Arrow',
        toFullStateName(state)
      ).catch(err => logger.warn(`State select failed: ${(err as Error).message}`));
    }
    if (zip) {
      await page.locator('#ContentPlaceHolder1_FormView1_ctl02_ctl10___ZipCode_TextBox1').first().fill(zip);
    }
  }

  // Los checkboxes están envueltos por iCheck — el input nativo está oculto
  // y Playwright no puede alternarlo con .check()/.uncheck().
  // Usamos la API del plugin (jQuery iCheck) vía evaluate.
  await toggleIcheck(page, 'cblAdditionalInterests_0', false); // Additional Insured -> desmarcado
  await page.waitForTimeout(500);

  // Loss Payee -> marcado. Reintentos externos + verificación:
  // toggleIcheck ya reintenta 3 veces internamente; envolvemos en otro loop
  // por si el primer ciclo entero no logra dejarlo marcado (carga tardía, foco, etc.).
  const MAX_LP_RETRIES = 3;
  let lpChecked = false;
  for (let attempt = 1; attempt <= MAX_LP_RETRIES && !lpChecked; attempt++) {
    await toggleIcheck(page, 'cblAdditionalInterests_5', true);
    await page.waitForTimeout(800);
    lpChecked = await page.locator('#cblAdditionalInterests_5').first()
      .evaluate((el: any) => !!el.checked)
      .catch(() => false);
    if (lpChecked) {
      logger.info(`Loss Payee checkbox verificado como marcado (intento ${attempt}/${MAX_LP_RETRIES})`);
      break;
    }
    logger.warn(`Loss Payee no quedó marcado (intento ${attempt}/${MAX_LP_RETRIES}), reintentando...`);
    // Dar tiempo a que la UI se estabilice antes del siguiente intento
    await page.waitForTimeout(1500);
  }
  if (!lpChecked) {
    throw new Error(`Loss Payee checkbox no quedó marcado tras ${MAX_LP_RETRIES} reintentos externos — se aborta el guardado para evitar holder sin Loss Payee`);
  }

  // Seleccionar la póliza Physical Damage del RadComboBox de pólizas.
  // Sin esto el Loss Payee queda sin póliza vinculada y el certificado sale vacío.
  await selectPolicyInMultiSelector(page, /Physical\s*Damage/i);

  // Description of Operations / Note
  if (holder.note?.trim()) {
    const desc = page.locator('#txtDescription').first();
    if (await desc.count() > 0) {
      await desc.fill(holder.note.trim());
      await page.waitForTimeout(200);
    }
  }
}

/**
 * Intenta ubicar un holder existente en el RadAutoCompleteBox "Search list of
 * existing holders". Solo selecciona si hay **match EXACTO del nombre**
 * (la parte antes de " - " en el item, normalizada — sin puntos/comas, minúsculas).
 *
 * Si hay múltiples items con el mismo nombre (ej. el mismo holder con varias
 * direcciones en el sistema), usa `holderAddress` como desempate: prefiere el
 * item cuya parte de dirección (después de " - ") comparta la PRIMERA línea con
 * la dirección del correo (ej: "P.O. Box 128"). Si ninguno matchea por dirección,
 * devuelve false para que el bot cree un holder nuevo (seguro).
 *
 * Devuelve true si seleccionó un holder existente, false si no hubo match exacto.
 */
async function tryFindExistingHolder(page: Page, holderName: string, holderAddress?: string): Promise<boolean> {
  const searchInput = page.locator('#ctl00_ContentPlaceHolder1_txtCertificateHolders_Input').first();
  if (await searchInput.count() === 0) return false;

  try {
    await searchInput.click({ force: true });
    await page.waitForTimeout(400);
    // Usar los primeros chars del nombre (evita que comas/puntos bloqueen la búsqueda del servidor)
    const query = holderName.replace(/[.,]/g, '').trim().slice(0, 20);
    if (!query) return false;
    await searchInput.fill('');
    await searchInput.pressSequentially(query, { delay: 40 });

    // Esperar hasta 6s a que el popup RadAutoCompleteBox aparezca con items
    const hasList = await page.waitForSelector('ul.racList li.racItem', { state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!hasList) {
      await searchInput.fill('');
      return false;
    }

    // Buscar y clickear SOLO match exacto por nombre (con desempate por dirección).
    const clicked = await page.evaluate(({ name, address }) => {
      const doc = (globalThis as any).document;
      const list = doc?.querySelector?.('ul.racList');
      if (!list) return { clicked: false, reason: 'no-list' };
      const items = Array.from(list.querySelectorAll('li.racItem')) as any[];
      if (items.length === 0) return { clicked: false, reason: 'no-items' };

      const norm = (s: string) => (s || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
      const targetName = norm(name);
      const targetAddrFirst = address ? norm(address.split(',')[0] || '') : '';

      // 1) Juntar TODOS los items con nombre EXACTAMENTE igual al target
      const exactMatches = items.filter((li) => {
        const txt = (li.textContent || '').trim();
        const company = norm(txt.split(' - ')[0] || '');
        return company === targetName;
      });

      if (exactMatches.length === 0) {
        return {
          clicked: false,
          reason: 'no-exact-name-match',
          targetName,
          sampleItems: items.slice(0, 4).map((li: any) => (li.textContent || '').trim()),
        };
      }

      // 2) Si hay varios, desempatar por dirección (primera línea del address del correo)
      let chosen = exactMatches[0];
      let matchReason: string = 'exact-name-single';
      if (exactMatches.length > 1) {
        matchReason = 'exact-name-multi-first';
        if (targetAddrFirst) {
          const byAddress = exactMatches.filter((li) => {
            const txt = (li.textContent || '').trim();
            const addrPart = norm(txt.split(' - ').slice(1).join(' - '));
            return addrPart.includes(targetAddrFirst);
          });
          if (byAddress.length >= 1) {
            // Si hay uno o varios matches con nombre + dirección, tomar el primero.
            // Cuando la BD tiene duplicados con nombre+dirección idénticas (caso confirmado
            // live 2026-04-23 con "Mitsubishi HC Capital America, Inc., ISAOA - P.O. Box 128"),
            // son el "mismo" holder lógicamente — mejor reusar el primero que crear un tercero.
            chosen = byAddress[0];
            matchReason = byAddress.length === 1 ? 'exact-name+address' : 'exact-name+address-duplicate-first';
          } else {
            // Múltiples matches por nombre pero ninguno por dirección — no arriesgar,
            // que el bot cree uno nuevo (puede tratarse de un holder de otro cliente).
            return {
              clicked: false,
              reason: 'multi-name-no-address-match',
              targetName,
              targetAddrFirst,
              candidates: exactMatches.map((li: any) => (li.textContent || '').trim()),
            };
          }
        }
      }

      chosen.click();
      return { clicked: true, reason: matchReason, text: (chosen.textContent || '').trim() };
    }, { name: holderName, address: holderAddress ?? '' });

    if (!clicked.clicked) {
      logger.info(`tryFindExistingHolder: ${clicked.reason} para "${holderName}"${(clicked as any).candidates ? ` — candidatos: ${JSON.stringify((clicked as any).candidates)}` : ''}`);
      await searchInput.fill('');
      return false;
    }
    logger.info(`tryFindExistingHolder: match ${clicked.reason} → "${(clicked as any).text}"`);
    return true;
  } catch (err) {
    logger.warn(`tryFindExistingHolder error: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Abre el RadComboBox multi-select de pólizas y marca el item cuyo texto
 * matche el regex dado (ej: /Physical Damage/i). Los items tienen formato
 * `{PolicyNumber} ({EffDate}, {LOB})` — matcheamos por el LOB al final.
 * Reintenta hasta 3 veces por si la UI tarda en responder.
 */
async function selectPolicyInMultiSelector(page: Page, labelRegex: RegExp): Promise<void> {
  // NowCerts cambia el id segmento `ctl02` (Insert.aspx) por `ctl01` (Edit.aspx).
  // Resolvemos el arrow y dropdown dinámicamente por sufijo para soportar ambos.
  const arrowSuffix = 'ddlPolicies_Arrow';
  const dropdownSuffix = 'ddlPolicies_DropDown';
  const pattern = labelRegex.source;
  const flags = labelRegex.flags;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const openResult = await page.evaluate(
      ({ arrowSuffix }) => {
        const doc = (globalThis as any).document;
        const arrow = [...doc.querySelectorAll('[id]')].find((el: any) =>
          (el.id || '').endsWith(arrowSuffix) && /usrPoliciesMultiSelector/i.test(el.id || '')
        );
        if (!arrow) return { ok: false, reason: 'arrow-not-found', arrowId: null as string | null };
        (arrow as any).click();
        return { ok: true, reason: 'arrow-clicked', arrowId: (arrow as any).id };
      },
      { arrowSuffix }
    );
    if (!openResult.ok) {
      logger.warn(`selectPolicyInMultiSelector: ${openResult.reason}`);
      return;
    }
    await page.waitForTimeout(800);

    const selected = await page.evaluate(
      ({ dropdownSuffix, pattern, flags }) => {
        const doc = (globalThis as any).document;
        const win = globalThis as any;
        const re = new RegExp(pattern, flags);
        const dd = [...doc.querySelectorAll('[id]')].find((el: any) =>
          (el.id || '').endsWith(dropdownSuffix) && /usrPoliciesMultiSelector/i.test(el.id || '')
        ) as any;
        if (!dd) return { ok: false, reason: 'dropdown-not-found' };
        const items = dd.querySelectorAll('li.rcbItem');
        for (const li of items) {
          const txt = (li.textContent || '').trim();
          if (re.test(txt)) {
            const cb = li.querySelector('input[type="checkbox"]') as any;
            const label = li.querySelector('label') as any;
            if (!cb) return { ok: false, reason: 'no-checkbox-in-item', itemText: txt };
            if (cb.checked) return { ok: true, reason: 'already-checked', itemText: txt };

            // Estrategia 1: iCheck API (si está disponible)
            try {
              const jq = win.jQuery || win.$;
              if (jq && typeof jq === 'function') {
                const $cb = jq(cb);
                if ($cb && typeof $cb.iCheck === 'function') {
                  $cb.iCheck('check');
                  if (cb.checked) return { ok: true, reason: 'icheck-api', itemText: txt };
                }
              }
            } catch (e) { /* fall through */ }

            // Estrategia 2: click en el <label> que envuelve el checkbox — la forma
            // nativa en que Telerik RadComboBox multi-select alterna el item.
            // Funciona tanto en Insert.aspx como en Edit.aspx.
            if (label) {
              label.click();
              if (cb.checked) return { ok: true, reason: 'label-click', itemText: txt };
            }

            // Estrategia 3: click en el checkbox directamente
            cb.click();
            if (cb.checked) return { ok: true, reason: 'checkbox-click', itemText: txt };

            // Estrategia 4: click en el <li>
            li.click();
            if (cb.checked) return { ok: true, reason: 'li-click', itemText: txt };

            // Estrategia 5: set directo + eventos (último recurso, puede no reflejarse)
            cb.checked = true;
            cb.dispatchEvent(new Event('ifChanged', { bubbles: true }));
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            cb.dispatchEvent(new Event('click', { bubbles: true }));
            return { ok: cb.checked, reason: 'fallback', itemText: txt };
          }
        }
        return { ok: false, reason: 'item-not-found', totalItems: items.length };
      },
      { dropdownSuffix, pattern, flags }
    );

    // Cerrar dropdown
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    if (selected.ok) {
      logger.info(`selectPolicyInMultiSelector: marcada "${(selected as any).itemText ?? ''}" (${selected.reason})`);
      return;
    }
    logger.warn(`selectPolicyInMultiSelector intento ${attempt}/3: ${selected.reason}`);
    await page.waitForTimeout(800);
  }
  logger.warn(`selectPolicyInMultiSelector: NO se pudo marcar la póliza ${labelRegex} tras 3 intentos`);
}

/**
 * Alterna un checkbox envuelto por el plugin iCheck (custom, SIN API jQuery expuesta).
 *
 * Validación con MCP Playwright (2026-04-23):
 *   - El input nativo está oculto; el div wrapper `.icheckbox_square-blue` intercepta
 *     los clicks al input (error "intercepts pointer events").
 *   - Eventos sintéticos (dispatchEvent) NO funcionan porque los handlers delegados
 *     filtran por `isTrusted`.
 *   - El único click que funciona: click REAL de Playwright sobre el `<td>` que
 *     contiene el wrapper (la celda tiene el handler delegado).
 *
 * Estrategia:
 *   1. Cerrar el flash alert `#nowCertsAlert` si está presente (intercepta a veces).
 *   2. Click real de Playwright sobre `td:has(#{checkboxId})`.
 *   3. Verificar estado. Si no quedó, reintenta hasta 3 veces.
 *   4. Si aún así no queda, si desired=true se marca via assignación + evento como
 *      último recurso (puede no reflejarse en UI pero al menos en el form post).
 */
async function toggleIcheck(page: Page, checkboxId: string, desired: boolean): Promise<void> {
  const tdLocator = page.locator(`td:has(#${checkboxId})`).first();
  const labelLocator = page.locator(`label[for="${checkboxId}"]`).first();
  const cbLocator = page.locator(`#${checkboxId}`).first();

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Cerrar flash message si intercepta clicks
    await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const alert = doc?.getElementById?.('nowCertsAlert');
      if (alert) alert.remove();
    }).catch(() => {});

    // Verificar estado actual
    const current = await cbLocator.evaluate((el: any) => !!el.checked).catch(() => false);
    if (current === desired) return;

    // Click real de Playwright en el <td> padre (que sí dispara el handler delegado en Insert.aspx)
    try {
      await tdLocator.scrollIntoViewIfNeeded().catch(() => {});
      await tdLocator.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(600);
    } catch (err) {
      logger.debug(`toggleIcheck td-click fallo en intento ${attempt}: ${(err as Error).message}`);
    }

    let after = await cbLocator.evaluate((el: any) => !!el.checked).catch(() => false);
    if (after === desired) return;

    // Fallback: click sobre el <label for="..."> (confirmado live en Edit.aspx 2026-04-23 —
    // cuando el holder ya existe, iCheck no re-envuelve los checkboxes y td-click queda sin
    // efecto, pero el click nativo sobre el label sí alterna el input via atributo `for`).
    try {
      if (await labelLocator.count() > 0) {
        await labelLocator.scrollIntoViewIfNeeded().catch(() => {});
        await labelLocator.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(600);
      }
    } catch (err) {
      logger.debug(`toggleIcheck label-click fallo en intento ${attempt}: ${(err as Error).message}`);
    }

    after = await cbLocator.evaluate((el: any) => !!el.checked).catch(() => false);
    if (after === desired) return;

    logger.debug(`toggleIcheck: ${checkboxId} intento ${attempt}/3 — checked=${after}, deseado=${desired}`);
    await page.waitForTimeout(600);
  }

  // Último recurso: forzar vía JS (puede no reflejarse visualmente pero entra en el post)
  await cbLocator.evaluate((el: any, want: boolean) => {
    if (el.checked !== want) {
      el.checked = want;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('ifChanged', { bubbles: true }));
    }
  }, desired).catch(() => {});

  logger.warn(`toggleIcheck: ${checkboxId} no alternó con td ni label click — aplicado fallback JS`);
}
