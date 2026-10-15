import { render } from 'preact';

// Onboarding (PDD 4.3) is built in M7.
function Onboarding() {
  return (
    <main>
      <h1>Welcome to Doomscroll Autopsy</h1>
      <p class="muted">Onboarding is coming in a later milestone.</p>
    </main>
  );
}

render(<Onboarding />, document.getElementById('app')!);
