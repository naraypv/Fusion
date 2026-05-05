import { Loader2 } from "lucide-react";
import type { AuthAccountSummary } from "../api";
import { ProviderIcon } from "./ProviderIcon";

interface CliAccountProviderCardProps {
  providerId: string;
  name: string;
  authenticated: boolean;
  accounts?: AuthAccountSummary[];
  busy?: boolean;
  onAddAccount: () => void;
}

export function CliAccountProviderCard({
  providerId,
  name,
  authenticated,
  accounts = [],
  busy = false,
  onAddAccount,
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
            ) : accounts.length > 0 ? (
              "Add another account"
            ) : (
              "Login"
            )}
          </button>
        </div>
      </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
