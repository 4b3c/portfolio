import calendar
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

from flask import session, jsonify

DATA = Path(__file__).parent / "stock_data"

LEVELS = {
    # (points, difficulty)
    0: (0, 1.0),
    1: (25, 1.2),
    2: (75, 1.5),
    3: (150, 2.0),
    4: (250, 3.0),
    5: (350, 4.0),
    6: (500, 6.0),
    7: (750, 8.0),
    8: (1000, 10.0),
    9: (1500, 15.0),
    10: (2000, 20.0),
    11: (2500, 25.0),
    12: (3000, 30.0)
}


COMPANY_NAMES = {
    'AAPL': "Apple Inc.",
    'MSFT': "Microsoft Corporation",
    'GOOGL': "Alphabet Inc.",
    'AMZN': "Amazon.com, Inc.",
    'TSLA': "Tesla, Inc.",
    'META': "Meta Platforms, Inc.",
    'NVDA': "NVIDIA Corporation",
    'JPM': "JP Morgan Chase & Co.",
    'V': "Visa Inc.",
    'UNH': "UnitedHealth Group Incorporated",
    'HD': "Home Depot, Inc. (The)",
    'PG': "Procter & Gamble Company (The)",
    'MA': "Mastercard Incorporated",
    'DIS': "Walt Disney Company (The)",
    'BAC': "Bank of America Corporation",
    'XOM': "Exxon Mobil Corporation",
    'PFE': "Pfizer, Inc.",
    'KO': "Coca-Cola Company (The)",
    'PEP': "Pepsico, Inc.",
    'CSCO': "Cisco Systems, Inc.",
    'CRM': "Salesforce, Inc.",
    'ADBE': "Adobe Inc.",
    'NFLX': "Netflix, Inc.",
    'T': "AT&T Inc.",
    'INTC': "Intel Corporation",
    'WMT': "Walmart Inc.",
    'CVX': "Chevron Corporation",
    'MRK': "Merck & Company, Inc.",
    'ABBV': "AbbVie Inc.",
    'MCD': "McDonald's Corporation",
    'COST': "Costco Wholesale Corporation",
    'WFC': "Wells Fargo & Company",
    'DHR': "Danaher Corporation",
    'ACN': "Accenture plc",
    'ABT': "Abbott Laboratories",
    'AVGO': "Broadcom Inc.",
    'TMO': "Thermo Fisher Scientific Inc",
    'LIN': "Linde plc",
    'TXN': "Texas Instruments Incorporated",
    'NEE': "NextEra Energy, Inc.",
    'NKE': "Nike, Inc.",
    'LLY': "Eli Lilly and Company",
    'MDT': "Medtronic plc.",
    'HON': "Honeywell International Inc.",
    'UNP': "Union Pacific Corporation",
    'QCOM': "QUALCOMM Incorporated",
    'LOW': "Lowe's Companies, Inc.",
    'PM': "Philip Morris International Inc",
    'ORCL': "Oracle Corporation",
    'AMGN': "Amgen Inc.",
    'SBUX': "Starbucks Corporation",
    'IBM': "International Business Machines",
    'AMAT': "Applied Materials, Inc.",
    'GS': "Goldman Sachs Group, Inc. (The)",
    'CAT': "Caterpillar, Inc.",
    'BLK': "BlackRock, Inc.",
    'RTX': "RTX Corporation",
    'GE': "GE Aerospace",
    'NOW': "ServiceNow, Inc.",
    'SPGI': "S&P Global Inc.",
    'ISRG': "Intuitive Surgical, Inc.",
    'CVS': "CVS Health Corporation",
    'LMT': "Lockheed Martin Corporation",
    'DE': "Deere & Company",
    'ADP': "Automatic Data Processing, Inc.",
    'SYK': "Stryker Corporation",
    'PLD': "Prologis, Inc.",
    'MO': "Altria Group, Inc.",
    'MDLZ': "Mondelez International, Inc.",
    'AXP': "American Express Company",
    'TGT': "Target Corporation",
    'C': "Citigroup, Inc.",
    'GILD': "Gilead Sciences, Inc.",
    'ZTS': "Zoetis Inc.",
    'CB': "Chubb Limited",
    'USB': "U.S. Bancorp",
    'MMC': "Marsh & McLennan Companies, Inc",
    'SCHW': "Charles Schwab Corporation (The",
    'CI': "The Cigna Group",
    'DUK': "Duke Energy Corporation (Holdin",
    'SO': "Southern Company (The)",
    'PNC': "PNC Financial Services Group, I",
    'CL': "Colgate-Palmolive Company",
    'APD': "Air Products and Chemicals, Inc",
    'BDX': "Becton, Dickinson and Company",
    'ADI': "Analog Devices, Inc.",
    'ICE': "Intercontinental Exchange Inc.",
    'SHW': "Sherwin-Williams Company (The)",
    'ITW': "Illinois Tool Works Inc.",
    'EW': "Edwards Lifesciences Corporatio",
    'VRTX': "Vertex Pharmaceuticals Incorpor",
    'ETN': "Eaton Corporation, PLC",
    'EL': "Estee Lauder Companies, Inc. (T",
    'CSX': "CSX Corporation",
    'NSC': "Norfolk Southern Corporation",
    'FDX': "FedEx Corporation",
    'EMR': "Emerson Electric Company",
    'AON': "Aon plc",
    'HUM': "Humana Inc.",
    'PSA': "Public Storage",
    'ECL': "Ecolab Inc.",
    'AIG': "American International Group, I",
    'MCO': "Moody's Corporation",
    'ADSK': "Autodesk, Inc.",
    'TFC': "Truist Financial Corporation",
    'D': "Dominion Energy, Inc.",
    'REGN': "Regeneron Pharmaceuticals, Inc.",
    'AEP': "American Electric Power Company",
    'GM': "General Motors Company",
    'SRE': "DBA Sempra",
    'PGR': "Progressive Corporation (The)",
    'F': "Ford Motor Company",
    'KMB': "Kimberly-Clark Corporation",
    'MCK': "McKesson Corporation",
    'WELL': "Welltower Inc.",
    'HCA': "HCA Healthcare, Inc.",
    'DOW': "Dow Inc.",
    'TRV': "The Travelers Companies, Inc.",
    'MS': "Morgan Stanley",
    'BKNG': "Booking Holdings Inc. Common St",
    'MAR': "Marriott International",
    'CME': "CME Group Inc.",
    'ORLY': "O'Reilly Automotive, Inc.",
    'IDXX': "IDEXX Laboratories, Inc.",
    'ROST': "Ross Stores, Inc.",
    'VRSK': "Verisk Analytics, Inc.",
    'CTAS': "Cintas Corporation",
    'MTD': "Mettler-Toledo International, I",
    'CDNS': "Cadence Design Systems, Inc.",
    'PAYX': "Paychex, Inc.",
    'ROP': "Roper Technologies, Inc.",
    'TT': "Trane Technologies plc",
    'PH': "Parker-Hannifin Corporation",
    'DLR': "Digital Realty Trust, Inc.",
    'VLO': "Valero Energy Corporation",
    'WMB': "Williams Companies, Inc. (The)",
    'ODFL': "Old Dominion Freight Line, Inc.",
    'STZ': "Constellation Brands, Inc.",
    'EXC': "Exelon Corporation",
    'PCAR': "PACCAR Inc.",
    'FTNT': "Fortinet, Inc.",
    'KMI': "Kinder Morgan, Inc.",
    'HLT': "Hilton Worldwide Holdings Inc.",
    'WEC': "WEC Energy Group, Inc.",
    'ED': "Consolidated Edison, Inc.",
    'EOG': "EOG Resources, Inc.",
    'PSX': "Phillips 66",
    'AFL': "AFLAC Incorporated",
    'ALL': "Allstate Corporation (The)",
    'PRU': "Prudential Financial, Inc.",
    'PEG': "Public Service Enterprise Group",
    'SYY': "Sysco Corporation",
    'XEL': "Xcel Energy Inc.",
    'AMP': "Ameriprise Financial, Inc.",
    'CNC': "Centene Corporation",
    'DLTR': "Dollar Tree, Inc.",
    'SBAC': "SBA Communications Corporation",
    'TSCO': "Tractor Supply Company",
    'VTR': "Ventas, Inc.",
    'BAX': "Baxter International Inc.",
    'CTSH': "Cognizant Technology Solutions ",
    'EFX': "Equifax, Inc.",
    'KEYS': "Keysight Technologies Inc.",
    'MLM': "Martin Marietta Materials, Inc.",
    'NEM': "Newmont Corporation",
    'RMD': "ResMed Inc.",
    'STE': "STERIS plc (Ireland)",
    'VMC': "Vulcan Materials Company (Holdi",
    'WST': "West Pharmaceutical Services, I",
    'ZBH': "Zimmer Biomet Holdings, Inc.",
    'ALGN': "Align Technology, Inc.",
    'ANSS': "ANSYS, Inc.",
    'BKR': "Baker Hughes Company",
    'BXP': "BXP, Inc.",
    'CARR': "Carrier Global Corporation",
    'CE': "Celanese Corporation",
    'CHRW': "C.H. Robinson Worldwide, Inc.",
    'CMS': "CMS Energy Corporation",
    'COO': "The Cooper Companies, Inc.",
    'CPB': "The Campbell's Company",
    'DHI': "D.R. Horton, Inc.",
    'DRI': "Darden Restaurants, Inc.",
    'EIX': "Edison International",
    'ESS': "Essex Property Trust, Inc.",
    'FANG': "Diamondback Energy, Inc.",
    'FMC': "FMC Corporation",
    'GLW': "Corning Incorporated",
    'HES': "Hess Corporation",
    'HIG': "The Hartford Insurance Group, I",
    'HOLX': "Hologic, Inc.",
    'IP': "International Paper Company",
    'JBHT': "J.B. Hunt Transport Services, I",
    'KIM': "Kimco Realty Corporation (HC)",
    'LDOS': "Leidos Holdings, Inc.",
    'LKQ': "LKQ Corporation",
    'LNT': "Alliant Energy Corporation",
    'LW': "Lamb Weston Holdings, Inc.",
    'MAS': "Masco Corporation",
    'MKC': "McCormick & Company, Incorporat",
    'NDSN': "Nordson Corporation",
    'NUE': "Nucor Corporation",
    'PKG': "Packaging Corporation of Americ",
    'PPL': "PPL Corporation",
    'PTC': "PTC Inc.",
    'RHI': "Robert Half Inc.",
    'RJF': "Raymond James Financial, Inc.",
    'ROL': "Rollins, Inc.",
    'RSG': "Republic Services, Inc.",
    'SEE': "Sealed Air Corporation",
    'SJM': "The J.M. Smucker Company",
    'SWK': "Stanley Black & Decker, Inc.",
    'TDY': "Teledyne Technologies Incorpora",
    'TER': "Teradyne, Inc.",
    'TYL': "Tyler Technologies, Inc.",
    'UAL': "United Airlines Holdings, Inc.",
    'UHS': "Universal Health Services, Inc.",
    'VFC': "V.F. Corporation",
    'WRB': "W.R. Berkley Corporation",
    'XRAY': "DENTSPLY SIRONA Inc."
}

TICKERS = list(COMPANY_NAMES.keys())
START_REF = datetime(2016, 7, 1)
BASE64_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/"

def from_base64(s):
    n = 0
    for c in s:
        n = n * 64 + BASE64_ALPHABET.index(c)
    return n

def to_base64(n):
    if n == 0: return '0'
    s = ''
    while n:
        n, r = divmod(n, 64)
        s = BASE64_ALPHABET[r] + s
    return s


def encode_game_code(ticker, date_str):
    date = datetime.strptime(date_str, '%Y-%m-%d')
    offset = (date - START_REF).days

    ticker_idx = TICKERS.index(ticker)
    number = ticker_idx * 1000000 + offset
    return to_base64(number)

def decode_game_code(code):
    number = from_base64(code)
    ticker_idx = number // 1000000
    offset = number % 1000000
    ticker = TICKERS[ticker_idx]
    date = START_REF + timedelta(days=offset)
    return ticker, date.strftime('%Y-%m-%d')


def random_game_code():
    ticker = random.choice(TICKERS)
    end_range = datetime(2024, 1, 1)
    offset_range = (end_range - START_REF).days
    offset = random.randint(0, offset_range)
    date = (START_REF + timedelta(days=offset)).strftime('%Y-%m-%d')
    return encode_game_code(ticker, date)


def valid_game_code(game_code):
    ticker, start_date = decode_game_code(game_code)
    if not ticker or not start_date:
        return False
    if ticker not in TICKERS:
        return False
    start_date = datetime.strptime(start_date, '%Y-%m-%d')
    if start_date < datetime(2016, 7, 1) or start_date > datetime(2024, 1, 1):
        return False
    return True


def add_months(date, months):
    # the same day n months on, or the month's last day if it's shorter (as pandas' DateOffset does)
    month = date.month - 1 + months
    year, month = date.year + month // 12, month % 12 + 1
    return date.replace(year=year, month=month, day=min(date.day, calendar.monthrange(year, month)[1]))


def read_prices(ticker):
    """Daily rows of one ticker's CSV, oldest first. The first three lines are yfinance's headers."""
    rows = []
    with open(DATA / f"{ticker}.csv", newline="") as f:
        for line in list(csv.reader(f))[3:]:
            if len(line) < 6 or not line[1]:
                continue
            date, close, high, low, _open, volume = line[:6]
            rows.append({
                "date": datetime.strptime(date, "%Y-%m-%d"),
                "close": float(close),
                "high": float(high) if high else float(close),
                "low": float(low) if low else float(close),
                "volume": int(float(volume)) if volume else 0,
            })
    rows.sort(key=lambda r: r["date"])
    return rows


def get_window():
    """The six months from this round's start date: (rows, ticker), or (None, None)."""
    ticker = session.get('ticker')
    start_date = session.get('start_date')
    if not ticker or not start_date or ticker not in TICKERS or not (DATA / f"{ticker}.csv").exists():
        return None, None
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = add_months(start, 6)
    return [r for r in read_prices(ticker) if start <= r["date"] <= end], ticker


def get_half_window_df(half):
    window, ticker = get_window()
    if window is None or len(window) < 2:
        return jsonify({'error': 'No data'}), 400

    mid_point = len(window) // 2
    if half == 'first':
        rows = window[:mid_point]
    elif half == 'second':
        rows = window[mid_point:]
    else:
        return jsonify({'error': 'Invalid half'}), 400
    return jsonify({
        'ticker': ticker,
        'dates': [r["date"].strftime('%Y-%m-%d') for r in rows],
        'prices': [r["close"] for r in rows],
        'volumes': [r["volume"] for r in rows],
        'highs': [r["high"] for r in rows],
        'lows': [r["low"] for r in rows],
    })
