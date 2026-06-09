// Resolve a Phosphor icon by its string name (used by admin-configurable
// on-demand service categories). Falls back to GridFour for unknown names.
import {
  Wrench, Broom, Heart, Baby, GasPump, ShieldCheck, Plant, Snowflake, Buildings,
  GraduationCap, Gavel, Bug, MusicNotes, AirplaneTilt, Barbell, Scissors, Car,
  Translate, HouseLine, ForkKnife, Key, Television, Desktop, PaintRoller, GridFour,
} from '@phosphor-icons/react';

const ICON_MAP = {
  Wrench, Broom, Heart, Baby, GasPump, ShieldCheck, Plant, Snowflake, Buildings,
  GraduationCap, Gavel, Bug, MusicNotes, AirplaneTilt, Barbell, Scissors, Car,
  Translate, HouseLine, ForkKnife, Key, Television, Desktop, PaintRoller, GridFour,
};

export const resolveIcon = (name) => ICON_MAP[name] || GridFour;
