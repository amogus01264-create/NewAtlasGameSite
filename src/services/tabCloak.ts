export type TabCloakPreset =
  | 'none'
  | 'classroom'
  | 'drive'
  | 'docs'
  | 'slides'
  | 'canvas'
  | 'desmos'
  | 'khan'
  | 'wikipedia'
  | 'custom';

export interface TabCloakConfig {
  preset: TabCloakPreset;
  customTitle?: string;
  customIcon?: string;
}

export interface PresetInfo {
  id: TabCloakPreset;
  label: string;
  title: string;
  iconUrl: string;
  badge: string;
}

export const CLOAK_PRESETS: PresetInfo[] = [
  {
    id: 'none',
    label: 'Atlas Default (No Cloak)',
    title: 'Atlas - Unblocked Gaming Network',
    iconUrl: '/favicon.ico',
    badge: 'Original',
  },
  {
    id: 'classroom',
    label: 'Google Classroom',
    title: 'Classes',
    iconUrl: 'https://ssl.gstatic.com/classroom/favicon.png',
    badge: 'Google',
  },
  {
    id: 'drive',
    label: 'Google Drive',
    title: 'My Drive - Google Drive',
    iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
    badge: 'Google',
  },
  {
    id: 'docs',
    label: 'Google Docs',
    title: 'Google Docs',
    iconUrl: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico',
    badge: 'Google',
  },
  {
    id: 'slides',
    label: 'Google Slides',
    title: 'Google Slides',
    iconUrl: 'https://ssl.gstatic.com/docs/presentations/images/favicon-yam-14.ico',
    badge: 'Google',
  },
  {
    id: 'canvas',
    label: 'Canvas LMS',
    title: 'Dashboard',
    iconUrl: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico',
    badge: 'School',
  },
  {
    id: 'desmos',
    label: 'Desmos Calculator',
    title: 'Desmos | Graphing Calculator',
    iconUrl: 'https://www.desmos.com/favicon.ico',
    badge: 'Math',
  },
  {
    id: 'khan',
    label: 'Khan Academy',
    title: 'Dashboard | Khan Academy',
    iconUrl: 'https://www.khanacademy.org/favicon.ico',
    badge: 'Study',
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    title: 'Wikipedia, the free encyclopedia',
    iconUrl: 'https://en.wikipedia.org/static/favicon/wikipedia.ico',
    badge: 'Ref',
  },
  {
    id: 'custom',
    label: 'Custom Disguise',
    title: 'New Tab',
    iconUrl: '',
    badge: 'Custom',
  },
];

const STORAGE_KEY = 'atlas_tab_cloak_config';

export function getSavedTabCloak(): TabCloakConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return { preset: 'none' };
}

export function saveTabCloak(config: TabCloakConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function setFavicon(url: string): void {
  if (typeof document === 'undefined') return;

  // Find or create link elements
  let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'shortcut icon';
    document.head.appendChild(link);
  }
  link.type = 'image/x-icon';
  link.href = url || '/favicon.ico';
}

export function applyTabCloak(config: TabCloakConfig): void {
  if (typeof document === 'undefined') return;

  if (config.preset === 'none') {
    document.title = 'Atlas - Unblocked Gaming Network';
    setFavicon('/favicon.ico');
    return;
  }

  if (config.preset === 'custom') {
    document.title = config.customTitle?.trim() || 'Classes';
    if (config.customIcon?.trim()) {
      setFavicon(config.customIcon.trim());
    }
    return;
  }

  const preset = CLOAK_PRESETS.find((p) => p.id === config.preset);
  if (preset) {
    document.title = preset.title;
    setFavicon(preset.iconUrl);
  }
}

/**
 * Open in an about:blank cloaked tab (prevents browsing history from logging the game URL directly)
 */
export function openAboutBlankCloaked(url?: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = url || window.location.href;
  try {
    const win = window.open('about:blank', '_blank');
    if (!win) return false;

    const currentCloak = getSavedTabCloak();
    let title = 'Classes';
    let icon = 'https://ssl.gstatic.com/classroom/favicon.png';

    if (currentCloak.preset === 'custom') {
      title = currentCloak.customTitle || 'Classes';
      icon = currentCloak.customIcon || icon;
    } else if (currentCloak.preset !== 'none') {
      const p = CLOAK_PRESETS.find((item) => item.id === currentCloak.preset);
      if (p) {
        title = p.title;
        icon = p.iconUrl;
      }
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <link rel="shortcut icon" href="${icon}" type="image/x-icon">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background-color: #000;
            }
            iframe {
              border: none;
              width: 100%;
              height: 100%;
            }
          </style>
        </head>
        <body>
          <iframe src="${target}" allowfullscreen="true" allow="autoplay; fullscreen; gamepad"></iframe>
        </body>
      </html>
    `);
    win.document.close();
    return true;
  } catch (err) {
    console.error('Failed to open about:blank window:', err);
    return false;
  }
}
