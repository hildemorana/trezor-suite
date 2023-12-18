import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useNavigation } from '@react-navigation/native';

import { useAlert } from '@suite-native/alerts';
import TrezorConnect from '@trezor/connect';
import {
    AccountsRootState,
    selectAccountByKey,
    TransactionsRootState,
    selectPendingAccountAddresses,
    selectIsAccountUtxoBased,
    selectAccountNetworkSymbol,
    selectIsSelectedDeviceImported,
    confirmAddressOnDeviceThunk,
} from '@suite-common/wallet-core';
import { AccountKey } from '@suite-common/wallet-types';
import { getFirstFreshAddress } from '@suite-common/wallet-utils';
import { analytics, EventType } from '@suite-native/analytics';
import { requestPrioritizedDeviceAccess } from '@suite-native/device-mutex';

export const useAccountReceiveAddress = (accountKey: AccountKey) => {
    const dispatch = useDispatch();
    const [isReceiveApproved, setIsReceiveApproved] = useState(false);
    const [isUnverifiedAddressRevealed, setIsUnverifiedAddressRevealed] = useState(false);
    const isPortfolioTracker = useSelector(selectIsSelectedDeviceImported);
    const navigation = useNavigation();

    const { showAlert } = useAlert();

    const account = useSelector((state: AccountsRootState) =>
        selectAccountByKey(state, accountKey),
    );
    const networkSymbol = useSelector((state: AccountsRootState) =>
        selectAccountNetworkSymbol(state, accountKey),
    );
    const pendingAddresses = useSelector((state: TransactionsRootState) =>
        selectPendingAccountAddresses(state, accountKey),
    );
    const isAccountUtxoBased = useSelector((state: AccountsRootState) =>
        selectIsAccountUtxoBased(state, accountKey),
    );

    const freshAddress = useMemo(() => {
        if (account) {
            return getFirstFreshAddress(account, [], pendingAddresses, isAccountUtxoBased);
        }
    }, [account, pendingAddresses, isAccountUtxoBased]);

    const verifyAddressOnDevice = useCallback(async (): Promise<boolean> => {
        if (accountKey && freshAddress) {
            const response = await requestPrioritizedDeviceAccess(() => {
                const thunkResponse = dispatch(
                    confirmAddressOnDeviceThunk({
                        accountKey,
                        addressPath: freshAddress.path,
                        chunkify: true,
                    }),
                ).unwrap();
                return thunkResponse;
            });

            if (!response.success) {
                // Wasn't able to get access to device
                console.warn(response.error);
                return false;
            }

            if (!response.payload.success) {
                showAlert({
                    title: response.payload.payload.code,
                    description: response.payload.payload.error,
                    icon: 'warningCircle',
                    pictogramVariant: 'red',
                    primaryButtonTitle: 'Cancel',
                    onPressPrimaryButton: () => {
                        navigation.goBack();
                        TrezorConnect.cancel();
                        setIsUnverifiedAddressRevealed(false);
                    },
                });
                return false;
            }

            return response.payload.success;
        }

        return false;
    }, [accountKey, freshAddress, dispatch, showAlert, navigation]);

    const handleShowAddress = useCallback(async () => {
        if (isPortfolioTracker) {
            if (networkSymbol) {
                analytics.report({
                    type: EventType.CreateReceiveAddressShowAddress,
                    payload: { assetSymbol: networkSymbol },
                });
                setIsReceiveApproved(true);
            }
        } else {
            setIsUnverifiedAddressRevealed(true);
            const wasVerificationSuccessful = await verifyAddressOnDevice();

            if (wasVerificationSuccessful) {
                analytics.report({ type: EventType.ConfirmedReceiveAdress });
                setIsReceiveApproved(true);
            }
        }
    }, [isPortfolioTracker, networkSymbol, verifyAddressOnDevice]);

    return {
        address: freshAddress?.address,
        isReceiveApproved,
        isUnverifiedAddressRevealed,
        handleShowAddress,
    };
};
