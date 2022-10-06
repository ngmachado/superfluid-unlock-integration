## Unlock Protocol:
Unlock allows creators, communities and events to monetize access through NFT-Gating.

Offchain, Unlock presents itself as a checkout widget. Login with your web3 wallet. If you have the Key, get access. If you don’t get redirected to pay (in some form)

Onchain, the Unlock system has two main components:

1. Keys. These are the NFTs that give users access
2. Locks. This is a contract which creates, manages and revokes keys

## Superfluid integration

Using Superfluid, Unlock plans to allow creators to monetize on a recurring basis, through payment streams. Users will be granted a Key if they start a stream of a certain quantity to the creator, and the Key will be revoked if the stream is interrupted. 

Each Lock has a specific payment method (i.e. currency/network/modality) so in the UI a Superfluid integration will look like a different kind of lock. However, in order to enable custom payment methods, the Lock creator will need to deploy a contract, called SFRouter in this document, which will manage the streams.


## User Flow

**Creators:**

1. Deploy a ***Lock*** + ***SFRouter***, setting a SuperToken as the required currency for the lock
2. Set the SFRouter as *KeyGranter* by calling the function `addKeyGranter()` 
3. Install Lock in their website, by adding the required JSON config, specifying both Lock contract and SFRouter contract addresses
4. As funds accumulate, withdraw them **from the Lock** 

**Subscribers:**

1. Go to a website and find the Unlock button
2. Stream SuperTokens to the SFRouter address (not the lock!) 
3. Automatically receive a Key from the Lock 
    1. In the `onAgreementCreated()` callback, the SFRouter will call `grantKey()`, issuing a key with the SFRouter as KeyManager
4. If the stream is interrupted, lose the Key
    1. In the `onAgreementTerminated()` callback, the SFRouter will call `cancelAndRefund()` to revoke access


## Smart Contract

In order to avoid having to change anything in the base Unlock contract, we’ll be building out our integration as a *Key Granter*, an auxiliary contract to whom the Lock delegates permission to grant keys.

When issuing a key, the SFRouter will give itself the *KeyManager* role, allowing it to revoke the key. 

The SFRouter is a SuperApp that receives funds from users in streams, and will need to redirect the funds to the main *Lock* contract, so the owner of the Lock can redeem them. 

When the user starts the stream, in the `onAgreementCreated()` callback:

- call `grantKey()`, issuing a key with the SFRouter as KeyManager, and no expiry (set to `0` )
- create/update stream to Lock contract to achieve `netFlow zero`

When the stream is interrupted, in the `onAgreementTerminated()` callback:

- call `cancelAndRefund()` to revoke access
- update/delete stream to Lock contract to achieve `netFlow zero`

Other functions:

```solidity
function withdrawAll() public onlyLockOwner {
	// can be called by lockOwner to withdraw funds
}

function closeStream(sender, receiver) public onlyLockOwner {
  // can be called by lockOwner to close incoming streams
}
```
