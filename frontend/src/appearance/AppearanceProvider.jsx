import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE,
  decodeAppearance, encodeAppearance, normalizeAppearance
} from './appearanceModel.mjs';

const AppearanceContext = createContext(null);

function readStoredAppearance() {
  try { return decodeAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}

/** One React state owner; all page/component CSS consumes central design tokens. */
export function AppearanceProvider({ children }) {
  const [appearance, setAppearance] = useState(readStoredAppearance);

  const updateAppearance = useCallback(patch => {
    setAppearance(previous => normalizeAppearance({ ...previous, ...patch }));
  }, []);
  const resetAppearance = useCallback(() => {
    setAppearance({ ...DEFAULT_APPEARANCE });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.asteriaBackground = appearance.background;
    root.dataset.asteriaBodyFont = appearance.bodyFont;
    root.dataset.asteriaDisplayFont = appearance.displayFont;
    root.dataset.asteriaTextSize = appearance.textSize;
    try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, encodeAppearance(appearance)); }
    catch { /* Private mode or disabled storage: keep in-memory preferences. */ }
  }, [appearance]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
        setAppearance(decodeAppearance(event.key === null ? null : event.newValue));
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <AppearanceContext.Provider value={{ appearance, updateAppearance, resetAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be called within AppearanceProvider');
  return value;
}
