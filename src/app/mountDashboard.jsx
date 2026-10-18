import React from 'react';
import '../styles/asteria-react.css';
import { createRoot } from 'react-dom/client';
import { AsteriaReactRoot } from './AsteriaReactRoot.jsx';

let root = null;
export function mountDashboard(host) {
  if(!root) root = createRoot(host);
  root.render(<AsteriaReactRoot />);
}
