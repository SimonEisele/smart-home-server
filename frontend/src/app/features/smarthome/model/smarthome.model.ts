export interface SmartDeviceState {
  [key: string]: string | number | boolean | null;
}

export interface SmartDevice {
  id: string;
  name: string;
  deviceType: string;
  room?: string;
  state: SmartDeviceState;
  createdAt?: string;
  updatedAt?: string;
}
