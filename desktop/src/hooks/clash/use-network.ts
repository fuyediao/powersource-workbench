import { getNetworkInterfacesInfo } from '@/services/clash/cmds'
import { useQuery } from '@/services/clash/query-client'

export const useNetworkInterfaces = () => {
  const {
    data,
    error,
    isFetching,
    isLoading,
    refetch: mutate,
  } = useQuery({
    queryKey: ['getNetworkInterfacesInfo'],
    queryFn: getNetworkInterfacesInfo,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: [],
  })

  return {
    networkInterfaces: data || [],
    loading: isLoading || isFetching,
    error,
    mutate,
  }
}
