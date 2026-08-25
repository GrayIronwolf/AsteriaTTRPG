import { useMemo } from 'react';
import { calculateCharacterAC } from './armourSystem.mjs';

export function useArmourClass(character) {
  return useMemo(() => calculateCharacterAC(character || {}), [character]);
}

