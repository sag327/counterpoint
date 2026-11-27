// Study No. 2 registry. Release slice v0.2 ships Echo only; the other studies
// join this list as their slices land (docs/runs/studies-01.md).
import { createEchoWorld, echoPresentation, echoWorld } from './echo.js';

export const STUDIES = Object.freeze([
  Object.freeze({ id: 'echo', numeral: 'II', create: createEchoWorld, preset: echoWorld, presentation: echoPresentation }),
]);

export const studyById = id => STUDIES.find(study => study.id === id) ?? null;
