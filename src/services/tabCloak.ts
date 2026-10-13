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

const ABOUT_BLANK_PROMPT_KEY = 'atlas_prompt_about_blank_on_launch';

export function isRunningInAboutBlank(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cloaked') === 'true') return true;
    if (window.self !== window.top) return true;
  } catch {
    // ignore
  }
  return false;
}

export function shouldPromptAboutBlankOnLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  if (isRunningInAboutBlank()) return false;
  try {
    const pref = localStorage.getItem(ABOUT_BLANK_PROMPT_KEY);
    if (pref === 'false') return false;
    return true;
  } catch {
    return false;
  }
}

export function setAboutBlankPromptPref(promptOnLaunch: boolean): void {
  try {
    localStorage.setItem(ABOUT_BLANK_PROMPT_KEY, promptOnLaunch ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function getAboutBlankPromptPref(): boolean {
  try {
    const pref = localStorage.getItem(ABOUT_BLANK_PROMPT_KEY);
    return pref !== 'false';
  } catch {
    return true;
  }
}

/**
 * Open in an about:blank cloaked tab (sets title to 'New Tab' by default)
 */
export function openAboutBlankCloaked(url?: string, customTitleOverride?: string): boolean {
  if (typeof window === 'undefined') return false;
  const currentUrl = url || window.location.href;
  
  let target = currentUrl;
  try {
    const parsed = new URL(currentUrl, window.location.origin);
    parsed.searchParams.set('cloaked', 'true');
    target = parsed.toString();
  } catch {
    target = currentUrl.includes('?') ? `${currentUrl}&cloaked=true` : `${currentUrl}?cloaked=true`;
  }

  try {
    const win = window.open('about:blank', '_blank');
    if (!win) return false;

    // Default title is "New Tab" as requested
    const title = customTitleOverride || 'New Tab';
    const icon = 'https://www.google.com/favicon.ico';

    win.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <link rel="shortcut icon" href="${icon}" type="image/x-icon">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background-color: #0b0f19;
            }
            iframe {
              border: none;
              width: 100%;
              height: 100%;
              display: block;
            }
          </style>
        </head>
        <body>
          <iframe src="${target}" allowfullscreen="true" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"></iframe>
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
