---
title: Phase 4 Advanced World Systems
type: handbook
category: World Architecture
tags:
  - world-state
  - economy
  - factions
  - timeline
  - phase-4
visibility: public
---

# Phase 4 Advanced World Systems

## Overview
Phase 4 adds the first Living Fantasy World Engine foundation for Asteria.

The world systems are campaign-aware, metadata-driven, and designed to connect to the Universal Compendium Engine, gameplay tools, GM dashboards, and future multiplayer persistence.

## Systems
- Dynamic World State
- World Economy
- Reputation and Factions
- Dynamic Events
- Interactive World Map
- Settlement Management
- Trade and Merchants
- Campaign Persistence
- Knowledge and Discovery
- Advanced GM Controls
- World Timeline
- AI NPC Foundations

## Data Sources
The living world reads from existing compendium domains:

- Locations create world regions, settlements, and map nodes.
- Factions and religions create reputation targets.
- Items create merchant stock and economy hooks.
- Creatures create discovery records and future spawn hooks.
- Lore entries create knowledge unlock records.

## Campaign Persistence
Each campaign receives its own world state. Player actions can be recorded as permanent world changes, completed events, destroyed locations, faction changes, NPC deaths, unlocked lore, and regional conditions.

## GM Visibility
The system supports player-safe preview, GM-only notes, hidden events, lore locks, encounter secrecy, and future campaign-specific overrides.

## Backend Readiness
Phase 4 saves locally for now and calls the existing Asteria save/sync hooks when available. The state model is isolated so Firebase or a future backend can sync campaign world data later.

