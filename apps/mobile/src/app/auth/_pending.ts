/** Closure-based store for signup data between screens. Not exported as mutable object. */
let _email = "";
let _password = "";

export function setPendingSignup(email: string, password: string) {
  _email = email;
  _password = password;
}

export function getPendingSignup(): { email: string; password: string } {
  return { email: _email, password: _password };
}

export function clearPendingSignup() {
  _email = "";
  _password = "";
}
