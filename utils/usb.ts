// USB vendor ids of the serial chips Meshtastic radios use. Passed to requestPort() so the
// picker lists radios only — on a Mac, Web Serial otherwise lists Bluetooth and virtual ports,
// and a member with a charge-only cable picks one of those and gets a "silent radio" (2026-11-05).
export const RADIO_USB_FILTERS: SerialPortFilter[] = [
  { usbVendorId: 0x303a }, // Espressif native USB (ESP32-S3: Heltec V4, T-Deck, ...)
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x (Heltec V3, many ESP32 boards)
  { usbVendorId: 0x1a86 }, // WCH CH340 / CH9102 (LilyGo and others)
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x239a }, // Adafruit / nRF52 boards
  { usbVendorId: 0x2886 }, // Seeed (XIAO nRF52)
  { usbVendorId: 0x1915 }, // Nordic (RAK nRF52 bootloader / app)
]
