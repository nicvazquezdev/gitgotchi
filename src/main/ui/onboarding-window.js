// Onboarding window: connect GitHub, pick repos and the pet. Also reopened later to change any of them.
const { createAppWindow } = require('./app-window');
const { ONBOARDING_WINDOW } = require('../config');

const onboarding = createAppWindow('onboarding', ONBOARDING_WINDOW);

module.exports = { open: onboarding.open, close: onboarding.close };
