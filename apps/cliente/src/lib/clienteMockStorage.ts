import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClienteMockStorage } from '@keepit/core-data';

export const clienteMockStorage: ClienteMockStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
