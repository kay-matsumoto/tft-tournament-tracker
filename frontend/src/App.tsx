import { useState, useEffect } from 'react';
import { Users, Trophy, Eye, EyeOff, Shield, Clock, Medal, Target, TrendingUp, Gamepad2, Star, Crown, Swords, Zap, Plus, Download, Upload } from 'lucide-react';

// Enhanced Type definitions
interface Tournament {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  participants: number;
  prize: string;
  region: string;
  gamesPerDay: number;
  currentDay: number;
  currentGame: number;
}

interface PlayerStats {
  placement: number;
  player: string;
  region: string;
  totalPoints: number;
  games: (number | null)[]; // Array of 6 games, null if not played yet
  top4Plus: number;
  firstPlaces: number;
  seconds: number;
  thirds: number;
  fourths: number;
  fifths: number;
  sixths: number;
  sevenths: number;
  eighths: number;
  endOfDayPlacement: number;
}

interface GameResult {
  gameNumber: number;
  matchId: string;
  players: { [playerName: string]: number }; // player -> placement
  timestamp: string;
}

const TFTTournamentTracker = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginData, setLoginData] = useState({ password: '', mfaCode: '' });
  const [apiKey, setApiKey] = useState('');
  
  const [tournaments] = useState<Tournament[]>([
    {
      id: 1,
      name: 'TFT Americas Championship',
      startDate: '2025-09-15',
      endDate: '2025-09-22',
      status: 'active',
      participants: 256,
      prize: '$50,000',
      region: 'Americas',
      gamesPerDay: 6,
      currentDay: 1,
      currentGame: 3
    },
    {
      id: 2,
      name: 'Regional Qualifier #3',
      startDate: '2025-09-25',
      endDate: '2025-09-28',
      status: 'upcoming',
      participants: 128,
      prize: '$25,000',
      region: 'Americas',
      gamesPerDay: 6,
      currentDay: 1,
      currentGame: 1
    }
  ]);
  
  const [, setSelectedTournament] = useState<Tournament | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [isLiveMode, setIsLiveMode] = useState(false);

  // Enhanced tournament data with complete statistics
  const [tournamentData] = useState({
    leaderboard: [
      { 
        placement: 1, 
        player: 'dishsoap', 
        region: 'NA1',
        totalPoints: 28, 
        games: [1, 2, 4, 1, null, null], 
        top4Plus: 4,
        firstPlaces: 2, 
        seconds: 1, 
        thirds: 0, 
        fourths: 1, 
        fifths: 0, 
        sixths: 0, 
        sevenths: 0, 
        eighths: 0,
        endOfDayPlacement: 1
      },
      { 
        placement: 2, 
        player: 'Souless', 
        region: 'NA1',
        totalPoints: 25, 
        games: [2, 1, 3, 3, null, null], 
        top4Plus: 4,
        firstPlaces: 1, 
        seconds: 1, 
        thirds: 2, 
        fourths: 0, 
        fifths: 0, 
        sixths: 0, 
        sevenths: 0, 
        eighths: 0,
        endOfDayPlacement: 2
      },
      { 
        placement: 3, 
        player: 'aespa karina', 
        region: 'NA1',
        totalPoints: 22, 
        games: [3, 4, 2, 2, null, null], 
        top4Plus: 4,
        firstPlaces: 0, 
        seconds: 2, 
        thirds: 1, 
        fourths: 1, 
        fifths: 0, 
        sixths: 0, 
        sevenths: 0, 
        eighths: 0,
        endOfDayPlacement: 3
      },
      { 
        placement: 4, 
        player: 'kurumx', 
        region: 'NA1',
        totalPoints: 20, 
        games: [4, 3, 1, 5, null, null], 
        top4Plus: 3,
        firstPlaces: 1, 
        seconds: 0, 
        thirds: 1, 
        fourths: 1, 
        fifths: 1, 
        sixths: 0, 
        sevenths: 0, 
        eighths: 0,
        endOfDayPlacement: 4
      },
      { 
        placement: 5, 
        player: 'Teamfight Chad', 
        region: 'NA1',
        totalPoints: 18, 
        games: [5, 5, 5, 4, null, null], 
        top4Plus: 1,
        firstPlaces: 0, 
        seconds: 0, 
        thirds: 0, 
        fourths: 1, 
        fifths: 3, 
        sixths: 0, 
        sevenths: 0, 
        eighths: 0,
        endOfDayPlacement: 5
      }
    ] as PlayerStats[],
    recentMatches: [
      { 
        gameNumber: 4,
        matchId: 'NA1_1234567890', 
        timestamp: '2025-09-07 14:30',
        players: {
          'dishsoap': 1,
          'Souless': 3,
          'aespa karina': 2,
          'kurumx': 5,
          'Teamfight Chad': 4,
          'Player6': 6,
          'Player7': 7,
          'Player8': 8
        }
      },
      { 
        gameNumber: 3,
        matchId: 'NA1_1234567891', 
        timestamp: '2025-09-07 13:45',
        players: {
          'dishsoap': 4,
          'Souless': 3,
          'aespa karina': 2,
          'kurumx': 1,
          'Teamfight Chad': 5,
          'Player6': 6,
          'Player7': 7,
          'Player8': 8
        }
      }
    ] as GameResult[]
  });

  // Game Results Management
  const [gameResults, setGameResults] = useState({
    selectedTournament: 1,
    selectedGame: 1,
    currentResults: {} as { [player: string]: number },
    availablePlayers: [
      'dishsoap', 'Souless', 'aespa karina', 'kurumx', 'Teamfight Chad',
      'Player6', 'Player7', 'Player8'
    ],
    isSubmitting: false
  });

  // Player Management (from previous version)
  const [playerManagement, setPlayerManagement] = useState({
    singlePlayer: { summonerName: '', region: 'na1', tournamentId: 1 },
    bulkPlayers: '',
    selectedTournament: 1,
    isProcessing: false,
    lastImportResults: null as { success: number; failed: number; errors: string[] } | null
  });

  useEffect(() => {
    const theme = localStorage.getItem('darkMode');
    if (theme) setDarkMode(JSON.parse(theme));
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Auto-refresh logic for live tournaments
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLiveMode && isAuthenticated) {
      interval = setInterval(() => {
        console.log('Refreshing tournament data...');
      }, refreshInterval * 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLiveMode, refreshInterval, isAuthenticated]);

  const handleLogin = () => {
    if (loginData.password === 'admin123') {
      setIsAuthenticated(true);
      setCurrentView('dashboard');
    } else {
      alert('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentView('dashboard');
    setLoginData({ password: '', mfaCode: '' });
  };

  const themeClasses = darkMode 
    ? 'bg-gray-900 text-white' 
    : 'bg-gray-50 text-gray-900';

  const cardClasses = darkMode 
    ? 'bg-gray-800 border-gray-700' 
    : 'bg-white border-gray-200';

  const inputClasses = darkMode 
    ? 'bg-gray-700 border-gray-600 text-white' 
    : 'bg-white border-gray-300 text-gray-900';

  // Calculate average placement for a player
  const calculateAverageScore = (games: (number | null)[]): number => {
    const validGames = games.filter(game => game !== null) as number[];
    if (validGames.length === 0) return 0;
    return validGames.reduce((sum, game) => sum + game, 0) / validGames.length;
  };

  // Submit game results
  const handleSubmitGameResults = async () => {
    const playerCount = Object.keys(gameResults.currentResults).length;
    const placements = Object.values(gameResults.currentResults);
    
    // Validation
    if (playerCount !== 8) {
      alert('Please enter results for all 8 players');
      return;
    }
    
    const uniquePlacements = new Set(placements);
    if (uniquePlacements.size !== 8 || !placements.every(p => p >= 1 && p <= 8)) {
      alert('Each player must have a unique placement from 1st to 8th');
      return;
    }

    setGameResults(prev => ({ ...prev, isSubmitting: true }));

    // Simulate API call
    setTimeout(() => {
      console.log('Game results submitted:', {
        tournament: gameResults.selectedTournament,
        game: gameResults.selectedGame,
        results: gameResults.currentResults
      });
      
      alert(`Game ${gameResults.selectedGame} results submitted successfully!`);
      setGameResults(prev => ({ 
        ...prev, 
        isSubmitting: false,
        currentResults: {},
        selectedGame: prev.selectedGame + 1
      }));
    }, 1500);
  };

  const LoginScreen = () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className={`max-w-md w-full mx-4 p-8 rounded-xl border ${cardClasses}`}>
        <div className="text-center mb-8">
          <Shield className="mx-auto h-12 w-12 text-blue-500 mb-4" />
          <h2 className="text-2xl font-bold">Admin Login</h2>
          <p className="text-gray-500 mt-2">Secure access to tournament management</p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={loginData.password}
                onChange={(e) => {
                  e.preventDefault();
                  setLoginData(prev => ({ ...prev, password: e.target.value }));
                }}
                className={`w-full px-4 py-3 rounded-lg border ${inputClasses} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
                placeholder="Enter admin password"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                  }
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPassword(!showPassword);
                }}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Demo password: admin123</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">MFA Code (Optional)</label>
            <input
              type="text"
              value={loginData.mfaCode}
              onChange={(e) => {
                e.preventDefault();
                setLoginData(prev => ({ ...prev, mfaCode: e.target.value }));
              }}
              className={`w-full px-4 py-3 rounded-lg border ${inputClasses} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
              placeholder="6-digit code from authenticator"
              autoComplete="one-time-code"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLogin();
                }
              }}
            />
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );

  const Navigation = () => (
    <nav className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} mb-6`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Trophy className="h-8 w-8 text-blue-500" />
            <h1 className="text-2xl font-bold">TFT Tournament Tracker</h1>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                currentView === 'dashboard' 
                  ? 'bg-blue-600 text-white' 
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setCurrentView('tournaments')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                currentView === 'tournaments' 
                  ? 'bg-blue-600 text-white' 
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tournaments
            </button>
            {isAuthenticated && (
              <>
                <button
                  onClick={() => setCurrentView('game-results')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentView === 'game-results' 
                      ? 'bg-blue-600 text-white' 
                      : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Game Results
                </button>
                <button
                  onClick={() => setCurrentView('admin')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentView === 'admin' 
                      ? 'bg-blue-600 text-white' 
                      : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Admin
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => setCurrentView('login')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Admin Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  const Dashboard = () => (
    <div className="space-y-6">
      {/* Tournament Status */}
      <div className={`p-4 rounded-lg border ${cardClasses}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Trophy className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="text-lg font-bold">TFT Americas Championship - Day 1</h3>
              <p className="text-gray-500">Game 3 of 6 • 256 players • Live now</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-600 font-medium">LIVE</span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={`p-6 rounded-xl border ${cardClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Games Completed</p>
              <p className="text-3xl font-bold text-green-500">3/6</p>
            </div>
            <Gamepad2 className="h-12 w-12 text-green-500" />
          </div>
        </div>
        <div className={`p-6 rounded-xl border ${cardClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Players</p>
              <p className="text-3xl font-bold text-blue-500">256</p>
            </div>
            <Users className="h-12 w-12 text-blue-500" />
          </div>
        </div>
        <div className={`p-6 rounded-xl border ${cardClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current Leader</p>
              <p className="text-xl font-bold text-yellow-500">dishsoap</p>
            </div>
            <Crown className="h-12 w-12 text-yellow-500" />
          </div>
        </div>
        <div className={`p-6 rounded-xl border ${cardClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Prize Pool</p>
              <p className="text-3xl font-bold text-yellow-500">$50K</p>
            </div>
            <Medal className="h-12 w-12 text-yellow-500" />
          </div>
        </div>
      </div>

      {/* AMER Tactician's Trials Format Leaderboard */}
      <div className={`p-6 rounded-xl border ${cardClasses}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">AMER Tactician's Trials - Day 1 Results</h3>
          <div className="flex items-center space-x-4">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-500">Last updated: 30 seconds ago</span>
            <button className="flex items-center space-x-2 px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <th className="text-left py-3 px-2 font-medium min-w-[120px] sticky left-0 ${cardClasses}">Player</th>
                <th className="text-left py-3 px-2 font-medium min-w-[80px]">Nationality</th>
                <th className="text-center py-3 px-2 font-medium min-w-[80px]">Total Points</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 1</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 2</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 3</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 4</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 5</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">Game 6</th>
                <th className="text-center py-3 px-2 font-medium min-w-[70px]">Top 4+</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">1st Places</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">2nd Places</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">3rd Places</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">4ths</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">5ths</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">6ths</th>
                <th className="text-center py-3 px-2 font-medium min-w-[60px]">7ths</th>
                <th className="text-center py-3 px-2 font-medium min-w-[80px]">8th Places</th>
                <th className="text-center py-3 px-2 font-medium min-w-[100px]">End of Day Placement</th>
                <th className="text-center py-3 px-2 font-medium min-w-[90px]">Placement in 5th Game</th>
                <th className="text-center py-3 px-2 font-medium min-w-[90px]">Placement in 4th Game</th>
                <th className="text-center py-3 px-2 font-medium min-w-[90px]">Placement in 3rd Game</th>
                <th className="text-center py-3 px-2 font-medium min-w-[90px]">Placement in 2nd Game</th>
                <th className="text-center py-3 px-2 font-medium min-w-[90px]">Placement in 1st Game</th>
              </tr>
            </thead>
            <tbody>
              {tournamentData.leaderboard
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .map((player, index) => (
                <tr 
                  key={index} 
                  className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} hover:bg-opacity-50 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                  onClick={() => setCurrentView('player-detail')}
                >
                  {/* Player Name - Sticky Column */}
                  <td className={`py-3 px-2 sticky left-0 ${cardClasses}`}>
                    <div className="flex items-center space-x-2">
                      {index + 1 <= 3 && (
                        <span className="text-lg">
                          {index + 1 === 1 ? '🥇' : index + 1 === 2 ? '🥈' : '🥉'}
                        </span>
                      )}
                      <Crown className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">{player.player}</span>
                    </div>
                  </td>
                  
                  {/* Nationality */}
                  <td className="py-3 px-2 text-center">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {player.nationality}
                    </span>
                  </td>
                  
                  {/* Total Points */}
                  <td className="py-3 px-2 text-center">
                    <span className="font-bold text-blue-600 text-lg">{player.totalPoints}</span>
                  </td>
                  
                  {/* Game Results */}
                  <td className="py-3 px-2 text-center">
                    {player.game1 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game1 === 1 ? 'bg-yellow-500' : 
                        player.game1 <= 4 ? 'bg-green-500' : 
                        player.game1 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game1}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.game2 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game2 === 1 ? 'bg-yellow-500' : 
                        player.game2 <= 4 ? 'bg-green-500' : 
                        player.game2 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game2}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.game3 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game3 === 1 ? 'bg-yellow-500' : 
                        player.game3 <= 4 ? 'bg-green-500' : 
                        player.game3 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game3}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.game4 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game4 === 1 ? 'bg-yellow-500' : 
                        player.game4 <= 4 ? 'bg-green-500' : 
                        player.game4 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game4}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.game5 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game5 === 1 ? 'bg-yellow-500' : 
                        player.game5 <= 4 ? 'bg-green-500' : 
                        player.game5 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game5}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.game6 ? (
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mx-auto ${
                        player.game6 === 1 ? 'bg-yellow-500' : 
                        player.game6 <= 4 ? 'bg-green-500' : 
                        player.game6 <= 6 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {player.game6}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  {/* Placement Statistics */}
                  <td className="py-3 px-2 text-center font-medium text-green-600">{player.top4Plus}</td>
                  <td className="py-3 px-2 text-center font-medium text-yellow-600">{player.firstPlaces}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.secondPlaces}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.thirdPlaces}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.fourths}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.fifths}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.sixths}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.sevenths}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{player.eighthPlaces}</td>
                  
                  {/* End of Day Placement */}
                  <td className="py-3 px-2 text-center">
                    <span className="font-bold text-blue-600">#{player.endOfDayPlacement}</span>
                  </td>
                  
                  {/* Individual Game Placements (Reverse Order) */}
                  <td className="py-3 px-2 text-center">
                    {player.placementIn5thGame ? (
                      <span className="font-medium">{player.placementIn5thGame}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.placementIn4thGame ? (
                      <span className="font-medium">{player.placementIn4thGame}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.placementIn3rdGame ? (
                      <span className="font-medium">{player.placementIn3rdGame}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.placementIn2ndGame ? (
                      <span className="font-medium">{player.placementIn2ndGame}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  
                  <td className="py-3 px-2 text-center">
                    {player.placementIn1stGame ? (
                      <span className="font-medium">{player.placementIn1stGame}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex items-center space-x-6 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
            <span>1st Place</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span>Top 4</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
            <span>5th-6th</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span>Bottom 2</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Game Results Entry Page
  const GameResultsPage = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Game Results Entry</h2>
        <div className="flex items-center space-x-4">
          <select 
            value={gameResults.selectedTournament}
            onChange={(e) => setGameResults(prev => ({ ...prev, selectedTournament: Number(e.target.value) }))}
            className={`px-4 py-2 rounded-lg border ${inputClasses} focus:ring-2 focus:ring-blue-500`}
          >
            {tournaments.map(tournament => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
          <select 
            value={gameResults.selectedGame}
            onChange={(e) => setGameResults(prev => ({ ...prev, selectedGame: Number(e.target.value) }))}
            className={`px-4 py-2 rounded-lg border ${inputClasses} focus:ring-2 focus:ring-blue-500`}
          >
            {[1,2,3,4,5,6].map(game => (
              <option key={game} value={game}>Game {game}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`p-6 rounded-xl border ${cardClasses}`}>
        <h3 className="text-lg font-bold mb-4">Enter Game {gameResults.selectedGame} Results</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {gameResults.availablePlayers.map((player, index) => (
            <div key={player} className="flex items-center space-x-4">
              <div className="w-32">
                <span className="font-medium">{player}</span>
              </div>
              <select
                value={gameResults.currentResults[player] || ''}
                onChange={(e) => setGameResults(prev => ({
                  ...prev,
                  currentResults: {
                    ...prev.currentResults,
                    [player]: Number(e.target.value)
                  }
                }))}
                className={`px-3 py-2 rounded-lg border ${inputClasses} focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">Select Placement</option>
                {[1,2,3,4,5,6,7,8].map(place => (
                  <option key={place} value={place}>{place}{place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} Place</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleSubmitGameResults}
            disabled={gameResults.isSubmitting || Object.keys(gameResults.currentResults).length !== 8}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {gameResults.isSubmitting ? 'Submitting...' : 'Submit Results'}
          </button>
          <button
            onClick={() => setGameResults(prev => ({ ...prev, currentResults: {} }))}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
          <span className="text-sm text-gray-500">
            {Object.keys(gameResults.currentResults).length}/8 players entered
          </span>
        </div>
      </div>
    </div>
  );

  // Rest of components remain the same...
  const TournamentManagement = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Tournament Management</h2>
      {/* Previous tournament management code */}
    </div>
  );

  const AdminPanel = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Admin Panel</h2>
      {/* Previous admin panel code with player management */}
    </div>
  );

  const PlayerDetail = () => (
    <div className="space-y-6">
      {/* Enhanced player detail with game-by-game history */}
    </div>
  );

  if (currentView === 'login') {
    return (
      <div className={`min-h-screen transition-colors ${themeClasses}`}>
        <LoginScreen />
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${themeClasses}`}>
      <Navigation />
      <div className="max-w-7xl mx-auto px-4">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'tournaments' && <TournamentManagement />}
        {currentView === 'game-results' && isAuthenticated && <GameResultsPage />}
        {currentView === 'admin' && isAuthenticated && <AdminPanel />}
        {currentView === 'player-detail' && <PlayerDetail />}
      </div>
    </div>
  );
};

export default TFTTournamentTracker;