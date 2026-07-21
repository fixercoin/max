# Fixorium Wallet Integration

This project connects to Fixorium Wallet through the browser `postMessage` bridge. The implementation is in:

```text
src/client/lib/fixoriumWalletConnector.ts
src/client/components/Header.tsx
```

## How connection works

1. The user clicks **Connect Wallet**.
2. The user selects **Fixorium Wallet**.
3. MAX DEX sends a `CONNECTION_REQUEST` message to the page.
4. Fixorium Wallet displays an approval request to the user.
5. The user approves or rejects the request.
6. Fixorium responds with the wallet public key.
7. MAX DEX stores the public key in its wallet context.

## Request message

MAX DEX sends this message through `window.postMessage`:

```ts
{
  type: 'CONNECTION_REQUEST',
  requestId: 'fixorium_unique_request_id',
  payload: {
    appOrigin: window.location.origin,
    appName: 'MAX DEX',
    platform: 'web'
  },
  timestamp: Date.now()
}
```

The `requestId` must be returned by Fixorium so the response can be matched to the correct request.

## Successful response

Fixorium can respond using `WALLET_CONNECTED`, `CONNECTION_RESPONSE`, or `CONNECTION_APPROVED`:

```ts
{
  type: 'WALLET_CONNECTED',
  requestId: 'fixorium_unique_request_id',
  payload: {
    publicKey: 'SolanaPublicKey'
  }
}
```

The public key may also be returned as `address`:

```ts
{
  type: 'CONNECTION_RESPONSE',
  requestId: 'fixorium_unique_request_id',
  payload: {
    address: 'SolanaPublicKey',
    approved: true
  }
}
```

## Rejected response

```ts
{
  type: 'CONNECTION_REJECTED',
  requestId: 'fixorium_unique_request_id',
  payload: {
    approved: false,
    error: 'Connection rejected by user'
  }
}
```

The app displays the rejection or timeout message in the wallet area.

## Disconnect

When the user disconnects, MAX DEX sends:

```ts
{
  type: 'WALLET_DISCONNECTED',
  payload: {},
  timestamp: Date.now()
}
```

Fixorium should clear the connected app session after receiving this message.

## Fixorium-side handling

The Fixorium bridge should listen for `CONNECTION_REQUEST`, show an approval screen, and then post a response back to the same page:

```ts
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'CONNECTION_REQUEST') return;

  const { requestId, payload } = event.data;

  // Show payload.appName and payload.appOrigin to the user.
  // Only send the public key after the user approves.
  window.postMessage({
    type: 'WALLET_CONNECTED',
    requestId,
    payload: {
      publicKey: 'YOUR_SOLANA_PUBLIC_KEY'
    }
  }, '*');
});
```

For a rejected request, send `CONNECTION_REJECTED` instead of `WALLET_CONNECTED`.

## Security requirements

- Verify the requesting application origin before approving a connection.
- Display the origin and app name to the user before approval.
- Never send a private key through `postMessage`.
- Never store private keys in MAX DEX local storage.
- Only return the public key and transaction results.
- Use a unique `requestId` for every request.
- Ignore messages from unexpected sources or with unknown request IDs.
- The Fixorium wallet must perform transaction signing internally.

## Transaction signing

The current MAX DEX integration covers wallet connection and disconnection. Transaction signing should be implemented as a separate bridge request so the private key remains inside Fixorium Wallet.

A transaction request should contain a serialized, base64-encoded Solana transaction:

```ts
{
  type: 'TRANSACTION_REQUEST',
  requestId: 'fixorium_transaction_id',
  payload: {
    transaction: 'BASE64_SERIALIZED_TRANSACTION',
    message: 'Sign this transaction',
    appOrigin: window.location.origin,
    appName: 'MAX DEX',
    platform: 'web'
  },
  timestamp: Date.now()
}
```

After the user approves and Fixorium signs and submits the transaction, it should return:

```ts
{
  type: 'TRANSACTION_SIGNED',
  requestId: 'fixorium_transaction_id',
  payload: {
    signature: 'SOLANA_TRANSACTION_SIGNATURE'
  }
}
```

A rejected transaction should return `TRANSACTION_REJECTED` with the same `requestId`.

## Troubleshooting

### No response from Fixorium

Make sure the Fixorium extension or wallet page is open and listening for `CONNECTION_REQUEST` messages. The MAX DEX request expires after 30 seconds.

### Public key is missing

The response must include either:

```ts
payload.publicKey
payload.address
publicKey
address
```

### The wallet connects but transactions fail

Connection alone does not provide transaction signing. Add the transaction bridge flow described above and keep signing inside Fixorium Wallet.
