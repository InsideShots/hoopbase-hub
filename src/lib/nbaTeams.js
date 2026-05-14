// NBA team data + logo URLs. Ported from my-court-stats23 src/lib/nbaTeams.js
// so the hoopbase /account/profile page can render a fav-team selector.

const NBA_TEAMS = {
  hawks: { name: 'Atlanta Hawks', abbr: 'ATL', id: 1610612737 },
  celtics: { name: 'Boston Celtics', abbr: 'BOS', id: 1610612738 },
  nets: { name: 'Brooklyn Nets', abbr: 'BKN', id: 1610612751 },
  hornets: { name: 'Charlotte Hornets', abbr: 'CHA', id: 1610612766 },
  bulls: { name: 'Chicago Bulls', abbr: 'CHI', id: 1610612741 },
  cavaliers: { name: 'Cleveland Cavaliers', abbr: 'CLE', id: 1610612739 },
  cavs: { name: 'Cleveland Cavaliers', abbr: 'CLE', id: 1610612739 },
  mavericks: { name: 'Dallas Mavericks', abbr: 'DAL', id: 1610612742 },
  mavs: { name: 'Dallas Mavericks', abbr: 'DAL', id: 1610612742 },
  nuggets: { name: 'Denver Nuggets', abbr: 'DEN', id: 1610612743 },
  pistons: { name: 'Detroit Pistons', abbr: 'DET', id: 1610612765 },
  warriors: { name: 'Golden State Warriors', abbr: 'GSW', id: 1610612744 },
  rockets: { name: 'Houston Rockets', abbr: 'HOU', id: 1610612745 },
  pacers: { name: 'Indiana Pacers', abbr: 'IND', id: 1610612754 },
  clippers: { name: 'LA Clippers', abbr: 'LAC', id: 1610612746 },
  lakers: { name: 'Los Angeles Lakers', abbr: 'LAL', id: 1610612747 },
  grizzlies: { name: 'Memphis Grizzlies', abbr: 'MEM', id: 1610612763 },
  heat: { name: 'Miami Heat', abbr: 'MIA', id: 1610612748 },
  bucks: { name: 'Milwaukee Bucks', abbr: 'MIL', id: 1610612749 },
  timberwolves: { name: 'Minnesota Timberwolves', abbr: 'MIN', id: 1610612750 },
  pelicans: { name: 'New Orleans Pelicans', abbr: 'NOP', id: 1610612740 },
  knicks: { name: 'New York Knicks', abbr: 'NYK', id: 1610612752 },
  thunder: { name: 'Oklahoma City Thunder', abbr: 'OKC', id: 1610612760 },
  magic: { name: 'Orlando Magic', abbr: 'ORL', id: 1610612753 },
  '76ers': { name: 'Philadelphia 76ers', abbr: 'PHI', id: 1610612755 },
  sixers: { name: 'Philadelphia 76ers', abbr: 'PHI', id: 1610612755 },
  suns: { name: 'Phoenix Suns', abbr: 'PHX', id: 1610612756 },
  blazers: { name: 'Portland Trail Blazers', abbr: 'POR', id: 1610612757 },
  kings: { name: 'Sacramento Kings', abbr: 'SAC', id: 1610612758 },
  spurs: { name: 'San Antonio Spurs', abbr: 'SAS', id: 1610612759 },
  raptors: { name: 'Toronto Raptors', abbr: 'TOR', id: 1610612761 },
  jazz: { name: 'Utah Jazz', abbr: 'UTA', id: 1610612762 },
  wizards: { name: 'Washington Wizards', abbr: 'WAS', id: 1610612764 },
}

const FULL_NAME_MAP = {}
const ABBR_MAP = {}
Object.values(NBA_TEAMS).forEach((t) => {
  FULL_NAME_MAP[t.name.toLowerCase()] = t
  ABBR_MAP[t.abbr.toLowerCase()] = t
})

export function getNbaTeamLogo(teamInput) {
  if (!teamInput) return null
  const key = teamInput.trim().toLowerCase()
  const team = NBA_TEAMS[key] || FULL_NAME_MAP[key] || ABBR_MAP[key]
  if (!team) return null
  return `https://cdn.nba.com/logos/nba/${team.id}/global/L/logo.svg`
}

export function getAllNbaTeams() {
  const seen = new Set()
  const list = []
  Object.values(NBA_TEAMS).forEach((t) => {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      list.push({
        name: t.name,
        abbr: t.abbr,
        id: t.id,
        logo: `https://cdn.nba.com/logos/nba/${t.id}/global/L/logo.svg`,
      })
    }
  })
  return list.sort((a, b) => a.name.localeCompare(b.name))
}
