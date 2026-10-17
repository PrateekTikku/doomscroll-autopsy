import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, SENSITIVITY_THRESHOLD, updateSettings, type Sensitivity, type Settings } from '@/lib/settings';

/** How firmly and how far nudges go (PDD 4.5): sensitivity and the highest step allowed. */
const SENSITIVITIES: Array<[Sensitivity, string]> = [
  ['gentle', 'Gentle'],
  ['balanced', 'Balanced'],
  ['strict', 'Strict'],
];
const STEPS: Array<[1 | 2 | 3, string, string]> = [
  [1, 'Banner', 'a small dismissible banner'],
  [2, 'Banner + blur', 'if you keep going, the feed blurs slightly'],
  [3, '+ breathing pause', 'a 30-second breathing cycle as the last step'],
];

export function NudgeSettings() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS as Settings);
  useEffect(() => {
    void getSettings().then(setS);
    return onSettingsChanged(setS);
  }, []);
  return (
    <section class="card" id="nudges">
      <div class="card-head">
        <h2>Nudges</h2>
        <span class="muted small">at most one per 15 minutes, never in Deep or Shallow work</span>
      </div>
      <div class="grid g2" style="gap:18px">
        <div>
          <div class="muted small" style="margin-bottom:6px">Sensitivity</div>
          <div class="seg" role="group" aria-label="Sensitivity">
            {SENSITIVITIES.map(([value, label]) => (
              <button key={value} class={s.sensitivity === value ? 'on' : ''} aria-pressed={s.sensitivity === value} title={`nudge at a spiral score of ${SENSITIVITY_THRESHOLD[value]}`} onClick={() => void updateSettings({ sensitivity: value }).then(setS)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div class="muted small" style="margin-bottom:6px">Highest step</div>
          <div class="seg" role="group" aria-label="Highest step">
            {STEPS.map(([value, label, hint]) => (
              <button key={value} class={s.maxNudgeStep === value ? 'on' : ''} aria-pressed={s.maxNudgeStep === value} title={hint} onClick={() => void updateSettings({ maxNudgeStep: value }).then(setS)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
