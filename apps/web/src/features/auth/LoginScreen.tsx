import { type FormEvent, useRef, useState } from "react";
import { UI_COPY } from "../../constants/ui-copy";
import { useAuth } from "./AuthProvider";
import { DEV_ACCOUNTS } from "./auth-storage";

type LoginErrorReason = "invalid_user" | "token_required" | null;

export function LoginScreen() {
  const { isProduction, loginAsDev, loginWithInput } = useAuth();
  const [userId, setUserId] = useState("");
  const [subjectToken, setSubjectToken] = useState("");
  const [errorReason, setErrorReason] = useState<LoginErrorReason>(null);

  const userIdInputRef = useRef<HTMLInputElement | null>(null);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = loginWithInput(userId, subjectToken);
    if (result.ok) {
      setErrorReason(null);
      return;
    }

    setErrorReason(result.reason);
    if (result.reason === "invalid_user") {
      userIdInputRef.current?.focus();
    } else {
      tokenInputRef.current?.focus();
    }
  };

  const errorMessage =
    errorReason === "invalid_user"
      ? UI_COPY.AUTH.INVALID_USER
      : errorReason === "token_required"
        ? UI_COPY.AUTH.TOKEN_REQUIRED_PROD
        : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {UI_COPY.AUTH.HEADING}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{UI_COPY.AUTH.SUBTITLE}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="login-user-id"
              className="block text-sm font-medium text-gray-700"
            >
              {UI_COPY.AUTH.USER_ID_LABEL}
            </label>
            <input
              ref={userIdInputRef}
              id="login-user-id"
              type="text"
              autoComplete="username"
              value={userId}
              placeholder={UI_COPY.AUTH.USER_ID_PLACEHOLDER}
              aria-invalid={errorReason === "invalid_user" ? true : undefined}
              aria-describedby={
                errorReason === "invalid_user" ? "login-form-error" : undefined
              }
              onChange={(event) => {
                setUserId(event.target.value);
                if (errorReason === "invalid_user") {
                  setErrorReason(null);
                }
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="login-subject-token"
              className="block text-sm font-medium text-gray-700"
            >
              {UI_COPY.AUTH.TOKEN_LABEL}
            </label>
            <input
              ref={tokenInputRef}
              id="login-subject-token"
              type="password"
              autoComplete="off"
              value={subjectToken}
              placeholder={UI_COPY.AUTH.TOKEN_PLACEHOLDER}
              aria-invalid={errorReason === "token_required" ? true : undefined}
              aria-describedby={
                errorReason === "token_required"
                  ? "login-form-error"
                  : undefined
              }
              onChange={(event) => {
                setSubjectToken(event.target.value);
                if (errorReason === "token_required") {
                  setErrorReason(null);
                }
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {errorMessage ? (
            <p
              id="login-form-error"
              role="alert"
              className="text-sm font-medium text-red-600"
            >
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            {UI_COPY.AUTH.SUBMIT}
          </button>
        </form>

        {!isProduction ? (
          <div className="mt-6 border-t border-gray-200 pt-5">
            <p className="text-xs font-medium text-gray-600">
              {UI_COPY.DEV_SWITCHER.LABEL}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEV_ACCOUNTS.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  onClick={() => {
                    setErrorReason(null);
                    loginAsDev(account);
                  }}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {account.displayName}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
