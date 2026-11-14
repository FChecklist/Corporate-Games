// The plug-in point: one line per game. To add a game, add its adapter folder under games/ and one line here.
import * as tambola from "../games/tambola/runtime.mjs";
export const games = {
  tambola: { runners: tambola.runners, deriveState: tambola.deriveState, say: tambola.say },
};
