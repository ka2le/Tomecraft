import { Flame, Box, CircleDot, Orbit, Eraser, Sparkles, Wind, Moon, Snowflake, Zap, Shield, Leaf } from 'lucide-react';
import type { Spell } from './spells';
const icons = { flame: Flame, box: Box, orbs: CircleDot, magnet: Orbit, eraser: Eraser, sparkles: Sparkles, wind: Wind, moon: Moon, snowflake: Snowflake, bolt: Zap, shield: Shield, leaf: Leaf };
export function SpellIcon({ spell, size = 24, className = '' }: { spell: Pick<Spell, 'icon'>; size?: number; className?: string }) {
  const Icon = icons[spell.icon] || Sparkles;
  return <Icon size={size} strokeWidth={1.3} className={className} aria-hidden="true" />;
}
