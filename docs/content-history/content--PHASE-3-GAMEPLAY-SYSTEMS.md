---
title: Phase 3 Gameplay Systems
type: handbook
category: Gameplay Architecture
tags:
  - gameplay
  - character-forge
  - gm-tools
  - phase-3
  - phase-3a
visibility: public
---

# Phase 3 Gameplay Systems

## Overview
Phase 3 adds playable RPG platform foundations on top of the Universal Compendium Engine and structured content databases.

The systems are frontend-safe and local-first for now. They are built so a backend can later replace local storage without changing the visible workspace tools.

## Systems
- Character Forge
- Character Sheet
- Character Appearance Builder
- Talent Tree Viewer
- Encounter Builder
- Loot Generator
- Crafting System
- Profession System
- Party System
- Adventure Guild System
- GM Campaign Tools

## Data Sources
Gameplay systems read from the universal compendium database where possible:

- Races
- Classes
- Creatures
- Items
- Talents
- Spells
- Professions
- Skills

## Character Forge Rules
Players move through the final Character Forge tab flow: Race, Class, Appearance, Origin, Characteristics, Skills, Equipment, and Review.

Players do not freely choose talents during the forge flow. Class talents are shown from class/talent data and treated as automatic progression.

Players do not choose professions during the forge flow. Profession slots begin as "No Profession Learned" and can be assigned later through campaign play or GM tools.

Starting skill selection requires exactly 4 skills from the Skill Compendium.

## Save Model
Phase 3 data is stored in browser local storage under the gameplay system key. Existing Asteria save helpers are called when available so future Firebase/database sync can attach cleanly.
