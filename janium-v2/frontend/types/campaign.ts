export interface Campaign {
  id: string;
  title: string;
  isActive: boolean;
  campaignType: string;
  campaignName: string;
  campaignDescription: string;
  contacts: number[];
  replied: number;
  connected: number;
  dailyExecutingWindowMin: number;
  dailyExecutingWindowMax: number;
  allowedExecutingDays: string[];
}
