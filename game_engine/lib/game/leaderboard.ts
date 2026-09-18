export type LeaderboardRow = {
  rank: number;
  display_name: string;
  total_xp: number;
  total_cash: number;
  errands_completed: number;
  cities_completed: number;
  /** True only on the signed-in player's own row. No user ids leave the database. */
  is_me: boolean;
};

export type LeaderboardResponse = {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
};
