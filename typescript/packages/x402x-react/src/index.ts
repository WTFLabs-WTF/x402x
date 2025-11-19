/**
 * X402 Payment Hook - using @x402-fetch
 */
import { useMutation } from '@tanstack/react-query';
import { wrapFetchWithPayment, type Signer } from 'x402x-fetch';
import { publicActions } from 'viem';
import type { WalletClient } from 'viem';
import createFetchWithProxyHeader from './lib/x402-helpers';
import type { UseMutationOptions } from '@tanstack/react-query';

// API response wrapper type
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

// Payment response data type
export interface X402PaymentResponse {
  success: boolean;
  network: string;
  payer: string;
  txHash: string;
  asset: string;
  amount: string;
  recipient: string;
  description?: string;
}

export interface UseX402PaymentOptions {
  targetUrl: string;         // Payment resource URL
  value: bigint;             // Payment amount (wei)
  paymentType?: string;      // Payment type (default 'permit')
  walletClient: WalletClient | undefined; // Wallet client from wagmi
  init?: RequestInit;        // Fetch options
  mutationOptions?: Omit<UseMutationOptions<X402PaymentResponse, Error>, 'mutationFn'>;
}

/**
 * X402 Payment Hook
 * 
 * Handles x402x-fetch payment flow:
 * - Fetch 402 response and requirements
 * - Generate Permit/EIP3009 signature
 * - Submit payment data
 */
export function useX402Payment(options: UseX402PaymentOptions) {
  const {
    targetUrl,
    value,
    paymentType = 'permit',
    walletClient,
    init,
    mutationOptions,
  } = options;

  return useMutation<X402PaymentResponse, Error>({
    mutationFn: async () => {
      // 1. Check walletClient
      if (!walletClient) {
        console.error('❌ walletClient not ready');
        throw new Error('钱包客户端未就绪，请先连接钱包');
      }

      // 2. Validate parameters
      if (!targetUrl || targetUrl === '') {
        throw new Error('支付资源 URL 无效');
      }

      if (!value || value === BigInt(0)) {
        throw new Error('支付金额无效，必须大于 0');
      }

      console.log('📋 Starting X402 payment flow...');
      console.log('targetUrl:', targetUrl);
      console.log('value:', value.toString());

      const time = Date.now();
      console.log('time:', time);

      // 3. Use x402-fetch package to handle payment
      const fetchWithProxyHeader = createFetchWithProxyHeader();
      const signer = walletClient.extend(publicActions) as unknown as Signer;
      const fetchWithPayment = wrapFetchWithPayment(fetchWithProxyHeader, signer, value);

      const endTime = Date.now();
      console.log('endTime:', endTime);
      console.log('duration:', endTime - time);

      // 4. Call payment API
      let requestInit = init;

      if (paymentType) {
        const mergedHeaders = new Headers(init?.headers ?? {});
        mergedHeaders.set('x-payment-type', paymentType);
        requestInit = {
          ...init,
          headers: mergedHeaders,
        };
      }

      const response = await fetchWithPayment(targetUrl, requestInit);

      // 5. Parse response
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`支付请求失败: ${response.status} ${errorText}`);
      }

      const apiResponse: ApiResponse<X402PaymentResponse> = await response.json();

      // 6. Check business status code
      if (apiResponse.code !== 0) {
        throw new Error(apiResponse.message || '支付失败');
      }

      // 7. Check if payment succeeded
      if (!apiResponse.data.success) {
        throw new Error('支付失败');
      }

      // 8. Return payment data
      return apiResponse.data;
    },
    ...mutationOptions,
  });
}

