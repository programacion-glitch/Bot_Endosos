import { Routes, Route, Navigate } from 'react-router-dom';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="container">
      <div className="card">{title}</div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <header className="app-header"><span className="dot" /> Portal de Endosos H2O</header>
      <Routes>
        <Route path="/" element={<Placeholder title="Inicio" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
