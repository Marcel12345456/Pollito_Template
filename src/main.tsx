import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { onlineManager } from '@tanstack/react-query';
import App from './App';
import { createPersistentQueryClient, persistOptions } from './lib/persist';
import { registerMutationDefaults } from './lib/mutations';
import './styles.css';

const queryClient = createPersistentQueryClient();

// Must happen before the cache is restored. A mutation persisted from an earlier
// session carries its key and variables but no function; without the defaults
// registered first, resuming it throws and the queued write is lost.
registerMutationDefaults(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Restore finished, so anything queued while offline can now be sent.
        // Guarded on connectivity: calling this offline would just re-pause them.
        if (onlineManager.isOnline()) {
          void queryClient.resumePausedMutations();
        }
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
