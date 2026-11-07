// Onboarding: step router and state shared between steps.
import { $ } from '../shared/dom.js';
import { createLoginStep } from './steps/login.js';
import { createReposStep } from './steps/repos.js';
import { createPetStep } from './steps/pet.js';

const api = window.gitgotchi;
const boot = await api.bootstrap();

/** State shared by all steps. */
const state = {
  user: boot.user,
  selectedRepos: new Set(boot.repos),
  existingPet: boot.pet,
  species: boot.pet?.species ?? boot.catalog.species[0].id,
  name: boot.pet?.name ?? '',
};

// IPC errors arrive as "Error invoking remote method '...': Error: message".
const messageOf = (value) =>
  value instanceof Error
    ? value.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(value);

let toastTimer = null;
/** Shows a short error message. Accepts text or an Error. */
function toast(message, ms = 4500) {
  const el = $('#toast');
  el.textContent = messageOf(message);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function go(step) {
  $('#step').replaceChildren(steps[step].render());
}

const ctx = { api, catalog: boot.catalog, state, go, toast };
const steps = {
  login: createLoginStep(ctx),
  repos: createReposStep(ctx),
  pet: createPetStep(ctx),
};

go('login');
