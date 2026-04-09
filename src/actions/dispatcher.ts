import { Page } from 'playwright';
import { Command, ActionResult, ParsedEmail } from '../types';
import { logger, logCommandStart, logCommandResult } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { screenshot } from '../browser/browserManager';
import { getInsuredIdFromUrl, buildInsuredUrl } from './_base';

import { createInsured } from './createInsured';
import { createMaster } from './createMaster';
import { addVehicle } from './addVehicle';
import { addDriver } from './addDriver';
import { removeVehicle } from './removeVehicle';
import { removeDriver } from './removeDriver';
import { removeHolder } from './removeHolder';
import { addAdditionalInsured } from './addAdditionalInsured';
import { addWaiverSubrogation } from './addWaiverSubrogation';
import { addAIandWOS } from './addAIandWOS';
import { addNoteToHolder } from './addNoteToHolder';
import { addNoteToMaster } from './addNoteToMaster';
import { addLossPayee } from './addLossPayee';
import { updateHolder } from './updateHolder';
import { updateLPHolder } from './updateLPHolder';
import { addPolicy } from './addPolicy';
import { updateLimitDeductible } from './updateLimitDeductible';
import { updateMailingAddress } from './updateMailingAddress';
import { deleteVehicleValue } from './deleteVehicleValue';
import { updateVehicleValue } from './updateVehicleValue';
import { updatePolicyNumber } from './updatePolicyNumber';
import { noChange } from './noChange';

/**
 * Navigates back to the insured's Information page.
 * This ensures each action starts from a known state.
 */
async function ensureOnInsuredProfile(page: Page, insuredId: string): Promise<void> {
  const url = page.url();
  if (url.includes(`/AMSINS/Insureds/Details/${insuredId}/Information`)) return;

  logger.info(`Navigating back to insured profile (${insuredId})`);
  await page.goto(buildInsuredUrl(insuredId, 'Information'), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(1500);
}

/**
 * Executes all commands from a parsed email in sequence.
 * Returns an array of results for each command.
 *
 * Before each command, navigates back to the insured profile to ensure
 * every action starts from a known state (independent of previous actions).
 */
export async function dispatchCommands(
  page: Page,
  email: ParsedEmail
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  const total = email.commands.length;

  // Capture insured ID while we're on the profile page.
  // For CREATE_INSURED the page won't be on a profile yet — we'll capture it after creation.
  let insuredId: string | null = null;
  const startsWithCreate = email.commands[0]?.type === 'CREATE_INSURED';
  if (!startsWithCreate) {
    try {
      insuredId = getInsuredIdFromUrl(page);
    } catch {
      logger.warn('dispatchCommands: could not extract insured ID from URL, actions will rely on current page state');
    }
  }

  for (let i = 0; i < total; i++) {
    const command = email.commands[i];
    logCommandStart(command.type, i + 1, total);

    // Re-navigate to insured profile before each command so every action is independent
    if (insuredId && command.type !== 'CREATE_INSURED') {
      await ensureOnInsuredProfile(page, insuredId);
    }

    let result: ActionResult;

    try {
      result = await withRetry(
        () => executeCommand(page, command, email),
        command.type
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Command ${command.type} failed after all retries: ${error.message}`);
      const shotPath = await screenshot(page, `error_${command.type}`).catch(() => undefined);
      result = {
        success: false,
        commandType: command.type,
        message: error.message,
        error,
        errorScreenshot: shotPath,
      };
    }

    // If the command returned success: false (without throwing), still capture a screenshot
    if (!result.success && !result.errorScreenshot) {
      const shotPath = await screenshot(page, `fail_${command.type}`).catch(() => undefined);
      if (shotPath) result.errorScreenshot = shotPath;
    }

    // After CREATE_INSURED succeeds, capture the new insured ID for subsequent commands.
    // NowCerts may take a moment to finish redirecting after the save, so we retry a few times.
    if (command.type === 'CREATE_INSURED' && result.success && !insuredId) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          insuredId = getInsuredIdFromUrl(page);
          logger.info(`Captured new insured ID: ${insuredId}`);
          break;
        } catch {
          if (attempt < 5) {
            logger.info(`Could not capture insured ID yet (attempt ${attempt}/5), waiting for redirect...`);
            await page.waitForTimeout(2000);
          }
        }
      }
      if (!insuredId) {
        logger.warn(`Could not capture insured ID after CREATE_INSURED. Current URL: ${page.url()}`);
      }
    }

    logCommandResult(result.commandType, result.success, result.message);
    results.push(result);
  }

  return results;
}

async function executeCommand(
  page: Page,
  command: Command,
  email: ParsedEmail
): Promise<ActionResult> {
  switch (command.type) {
    case 'CREATE_INSURED':
      return createInsured(page, command);

    case 'CREATE_MASTER':
      return createMaster(page, email.usdot);

    case 'ADD_VEHICLE':
      return addVehicle(page, command, email.commands);

    case 'ADD_DRIVER':
      return addDriver(page, command);

    case 'REMOVE_VEHICLE':
      return removeVehicle(page, command);

    case 'REMOVE_DRIVER':
      return removeDriver(page, command);

    case 'REMOVE_HOLDER':
      return removeHolder(page, command);

    case 'ADD_ADDITIONAL_INSURED':
      return addAdditionalInsured(page, command);

    case 'ADD_WAIVER_SUBROGATION':
      return addWaiverSubrogation(page, command);

    case 'ADD_AI_AND_WOS':
      return addAIandWOS(page, command);

    case 'ADD_NOTE_TO_HOLDER':
      return addNoteToHolder(page, command);

    case 'ADD_NOTE_TO_MASTER':
      return addNoteToMaster(page, command);

    case 'ADD_LOSS_PAYEE':
      return addLossPayee(page, command);

    case 'UPDATE_HOLDER':
      return updateHolder(page, command);

    case 'UPDATE_LP_HOLDER':
      return updateLPHolder(page, command);

    case 'ADD_POLICY':
      return addPolicy(page, command);

    case 'UPDATE_LIMIT_DEDUCTIBLE':
      return updateLimitDeductible(page, command);

    case 'UPDATE_MAILING_ADDRESS':
      return updateMailingAddress(page, command);

    case 'DELETE_VEHICLE_VALUE':
      return deleteVehicleValue(page, command);

    case 'UPDATE_VEHICLE_VALUE':
      return updateVehicleValue(page, command);

    case 'UPDATE_POLICY_NUMBER':
      return updatePolicyNumber(page, command);

    case 'NO_CHANGE':
      return noChange(email.from);

    default:
      return {
        success: false,
        commandType: (command as Command).type,
        message: `Unknown command type`,
      };
  }
}
