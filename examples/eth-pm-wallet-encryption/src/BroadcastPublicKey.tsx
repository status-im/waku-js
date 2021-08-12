import { Button } from '@material-ui/core';
import React from 'react';
import { createPublicKeyMessage } from './crypto';
import { PublicKeyMessage } from './messaging/wire';
import { WakuMessage, Waku } from 'js-waku';
import { Signer } from '@ethersproject/abstract-signer';
import { PublicKeyContentTopic } from './waku';

interface Props {
  encryptionPublicKey: Uint8Array | undefined;
  waku: Waku | undefined;
  signer: Signer | undefined;
  address: string | undefined;
}

export default function BroadcastPublicKey({
  signer,
  encryptionPublicKey,
  address,
  waku,
}: Props) {
  const broadcastPublicKey = () => {
    if (!encryptionPublicKey) return;
    if (!signer) return;
    if (!address) return;
    if (!waku) return;

    console.log('Creating Public Key Message');
    createPublicKeyMessage(signer, address, encryptionPublicKey)
      .then((msg) => {
        console.log('Public Key Message created');
        encodePublicKeyWakuMessage(msg)
          .then((wakuMsg) => {
            console.log('Public Key Message encoded');
            waku.lightPush
              .push(wakuMsg)
              .then((res) => console.log('Public Key Message pushed', res))
              .catch((e) => {
                console.error('Failed to send Public Key Message', e);
              });
          })
          .catch(() => {
            console.log('Failed to encode Public Key Message in Waku Message');
          });
      })
      .catch((e) => {
        console.error('Failed to create public key message', e);
      });
  };

  return (
    <Button
      variant="contained"
      color="primary"
      onClick={broadcastPublicKey}
      disabled={!encryptionPublicKey || !waku || !signer}
    >
      Broadcast Encryption Public Key
    </Button>
  );
}

async function encodePublicKeyWakuMessage(
  publicKeyMessage: PublicKeyMessage
): Promise<WakuMessage> {
  const payload = publicKeyMessage.encode();
  return await WakuMessage.fromBytes(payload, PublicKeyContentTopic);
}
