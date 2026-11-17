// The parallax theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in parallax.settings.json and the generated parallax.settings.ts;
// change them with `astryx experimental theme editor set parallax ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {parallaxSettings} from './parallax.settings';

export const parallaxTheme = defineTheme({
  extends: parallaxSettings,
  name: 'parallax',
  typography: {body:{family:'system-ui',fallbacks:'sans-serif'},heading:{family:'system-ui',fallbacks:'sans-serif'},code:{family:'ui-monospace',fallbacks:'monospace'}},
  tokens: {
    '--color-background-body': '#08090c',
    '--color-background-surface': '#0f1016',
    '--color-background-card': '#13141c',
    '--color-text-primary': '#f4f3fa',
    '--color-text-secondary': '#a3a4b8',
    '--color-border': '#ffffff18',
    '--studio-border-width':'1px',
    '--studio-brand-size': '1rem',
    '--studio-nav-size': '.625rem',
    '--studio-header': '4.6rem',
    '--studio-rail': '4.5rem',
    '--studio-rail-small':'3.25rem',
    '--studio-heading-size': 'clamp(1.7rem, 3vw, 2.6rem)',
    '--studio-canvas': '30rem',
    '--studio-canvas-small': '26rem',
    '--studio-hero-type': 'clamp(2.6rem, 7vw, 6.25rem)',
    '--studio-hero-scrim': 'linear-gradient(90deg, #08090cbd, #08090c00)',
    '--studio-composer-shadow': '0 1rem 5rem #00000033',
  },
});
