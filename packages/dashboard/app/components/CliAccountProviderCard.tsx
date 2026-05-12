import { Loader2 } from "lucide-react";
import type { AuthAccountSummary, ManualOAuthCodeInfo } from "../api";
import { ProviderIcon } from "./ProviderIcon";
import { LoginInstructions } from "./LoginInstructions";
import { OAuthManualCodeForm } from "./OAuthManualCodeForm";

interface CliAccountProviderCardProps {
  providerId: string;
  name: string;
  authenticated: boolean;
  accounts?: AuthAccountSummary[];
  busy?: boolean;
  loginInProgress?: boolean;
  instructions?: string;
  manualCode?: ManualOAuthCodeInfo;
  manualCodeValue?: string;
  manualCodeSubmitInProgress?: boolean;
  onManualCodeChange?: (value: string) => void;
  onManualCodeSubmit?: () => void;
  onCancelLogin?: () => void;
  onAddAccount: () => void;
  onSwitchAccount?: (accountId: string) => void;
  onRemoveAccount?: (accountId: string) => void;
}

export function CliAccountProviderCard({
  providerId,
  name,
  authenticated,
  accounts = [],
  busy = false,
  loginInProgress = false,
  instructions,
  manualCode,
  manualCodeValue = "",
  manualCodeSubmitInProgress = false,
  onManualCodeChange,
  onManualCodeSubmit,
  onCancelLogin,
  onAddAccount,
  onSwitchAccount,
  onRemoveAccount,
}: CliAccountProviderCardProps) {
  return (
    <div
      className={`auth-provider-card auth-provider-card--cli${authenticated ? " auth-provider-card--authenticated" : ""}`}
      data-testid={`${providerId}-provider-card`}
    >
      <div className="auth-provider-header">
        <div className="auth-provider-info">
          <ProviderIcon provider={providerId} size="sm" />
          <strong>{name}</strong>
          <span className={`auth-status-badge ${authenticated ? "authenticated" : "not-authenticated"}`}>
            {authenticated ? "✓ Active" : "✗ Not connected"}
          </span>
        </div>
        <div className="auth-provider-cli-actions">
          {loginInProgress ? (
            <>
              <button type="button" className="btn btn-sm" disabled>
                Waiting for login…
              </button>
              {onCancelLogin && (
                <button type="button" className="btn btn-sm" onClick={onCancelLogin}>
                  Cancel
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAddAccount}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Working…
                </>
              ) : authenticated || accounts.length > 0 ? (
                "Add another account"
              ) : (
                "Login"
              )}
            </button>
          )}
        </div>
      </div>
      {instructions && (loginInProgress || busy) && (
        <LoginInstructions
          instructions={instructions}
          data-testid={`auth-login-instructions-${providerId}`}
        />
      )}
      {manualCode && (loginInProgress || busy) && onManualCodeChange && onManualCodeSubmit && (
        <OAuthManualCodeForm
          value={manualCodeValue}
          onChange={onManualCodeChange}
          onSubmit={onManualCodeSubmit}
          prompt={manualCode.prompt}
          placeholder={manualCode.placeholder}
          helpText={manualCode.helpText}
          disabled={manualCodeSubmitInProgress}
          submitLabel={manualCodeSubmitInProgress ? "Submitting…" : "Submit code"}
          data-testid={`auth-manual-code-${providerId}`}
        />
      )}
      {accounts.length > 0 && (
        <div className="auth-account-list" data-testid={`auth-account-list-${providerId}`}>
          {accounts.map((account) => (
            <div key={account.id} className="auth-account-row">
              <span className="auth-account-label">{account.label}</span>
              {account.accountDisplayHint && (
                <span className="auth-account-hint">{account.accountDisplayHint}</span>
              )}
              <span className={`auth-account-status auth-account-status--${account.status}`}>
                {account.status}
              </span>
              {account.isDefault && (
                <span className="auth-account-default">Default</span>
              )}
              {(onSwitchAccount || onRemoveAccount) && (
                <div className="auth-account-actions">
                  {onSwitchAccount && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy || account.isDefault === true}
                      onClick={() => onSwitchAccount(account.id)}
                    >
                      Use
                    </button>
                  )}
                  {onRemoveAccount && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onRemoveAccount(account.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
