import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, SENSITIVITY_THRESHOLD, updateSettings, type Sensitivity, type Settings } from '@/lib/settings';

/** How firmly and how far nudges go (PDD 4.5): sensitivity and the highest step allowed. */
const SENSITIVITIES: Array<[Sensitivity, string]> = [
  ['gentle', 'Gentle'],
  ['balanced', 'Balanced'],
  ['strict', 'Strict'],
];
const STEPS: Array<[1 | 2 | 3, string, string]> = [
  [1, 'Banner only', 'a small dismissible banner'],
  [2, 'Banner, then blur', 'if you keep going, the feed blurs slightly'],
  [3, 'Banner, blur, then a breathing pause', 'a 30-second breathing cycle as the last step'],
];

export function NudgeSettings() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS as Settings);
  useEffect(() => {
    void getSettings().then(setS);
    return onSettingsChanged(setS);
  }, []);
  return (
    <section class="card" id="nudges">
      <h2>Nudges</h2>
      <p class="muted">At most one nudge per 15 minutes, never in Deep or Shallow work, and never while a Drain territory still has allowance left.</p>
      <div class="field">
        <span>Sensitivity</span>
        {SENSITIVITIES.map(([value, label]) => (
          <button key={value} class={`label-btn${s.sensitivity === value ? ' on' : ''}`} aria-pressed={s.sensitivity === value} title={`nudge at a spiral score of ${SENSITIVITY_THRESHOLD[value]}`} onClick={() => void updateSettings({ sensitivity: value }).then(setS)}>
            {label}
          </button>
        ))}
      </div>
      <div class="field">
        <span>Highest step</span>
        {STEPS.map(([value, label, hint]) => (
          <button key={value} class={`label-btn${s.maxNudgeStep === value ? ' on' : ''}`} aria-pressed={s.maxNudgeStep === value} title={hint} onClick={() => void updateSettings({ maxNudgeStep: value }).then(setS)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
