/**
 * Rete di sicurezza per l'interfaccia.
 *
 * Senza, un errore in un qualunque componente smonta l'intero albero React e
 * lascia una pagina bianca, senza alcun indizio. Qui l'errore viene mostrato
 * e si offre una via d'uscita: ripartire dai valori di esempio, nel caso in cui
 * sia la configurazione salvata a provocarlo.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { clearState } from './defaults.js';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[carovita]', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app">
        <h1>Carovita</h1>
        <div className="notice" style={{ borderLeftColor: 'var(--critical)' }}>
          <strong>Qualcosa è andato storto nel calcolo.</strong>
          <p style={{ margin: '6px 0' }} className="small">
            {error.message}
          </p>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => this.setState({ error: null })}
            >
              Riprova
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                clearState();
                window.location.reload();
              }}
            >
              Ricomincia dai valori di esempio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
