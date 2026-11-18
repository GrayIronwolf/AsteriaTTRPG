import React, { createContext, useContext } from 'react';
import { previewServices } from '../services/appServices.mjs';

// One service registry for the React root, not a second Firebase application.
const ServicesContext = createContext(previewServices);

export function AppServicesProvider({ services = previewServices, children }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useAppServices() {
  return useContext(ServicesContext);
}
