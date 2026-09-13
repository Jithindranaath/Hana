export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // iUSDC
  emoji: string;
}

// A range of prices on purpose: the cheaper items sit comfortably under most wallets' credit
// limit (score-based INSTALLMENT/TERM plans), the chair is priced to exercise the
// OVERCOLLATERALIZED fallback for a wallet without much imported history yet.
export const PRODUCTS: Product[] = [
  { id: "mouse", name: "Wireless Mouse", description: "Silent click, 2.4GHz, 6 months battery.", price: 25, emoji: "🖱️" },
  { id: "keyboard", name: "Mechanical Keyboard", description: "Hot-swappable switches, per-key RGB.", price: 89, emoji: "⌨️" },
  { id: "headphones", name: "Noise-Cancelling Headphones", description: "40h battery, adaptive ANC.", price: 149, emoji: "🎧" },
  { id: "webcam", name: "4K Webcam", description: "Autofocus, low-light correction.", price: 59, emoji: "📷" },
  { id: "dock", name: "USB-C Dock", description: "10-in-1, 100W passthrough.", price: 79, emoji: "🔌" },
  { id: "chair", name: "Ergonomic Chair", description: "Adjustable lumbar, mesh back.", price: 299, emoji: "🪑" },
];
