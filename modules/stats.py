import subprocess
import os
import ast
import re
from pathlib import Path
from collections import defaultdict
from modules.module import Module
from utils.session import state_path

class StatsModule(Module):
    """Generate comprehensive code statistics for the current project.

    Input contract: ignores `data["input"]` (no input required).
    Returns a markdown report with LOC, language, function, and git metrics.
    """

    def run(self, data) -> dict:
        try:
            report = self._generate_report()
            
            # Save to session state
            stats_file = state_path("stats.md")
            os.makedirs(os.path.dirname(stats_file), exist_ok=True)
            with open(stats_file, 'w') as f:
                f.write(report)
            
            return self.complete(report)
        except Exception as e:
            return self.fail(str(e))

    def _generate_report(self) -> str:
        """Generate the full statistics report in markdown format."""
        sections = []
        
        # Header
        sections.append("# Code Statistics Report\n")
        
        # Code metrics
        code_stats = self._get_code_stats()
        sections.append(self._format_code_stats(code_stats))
        
        # Function analysis
        sections.append(self._format_function_stats(code_stats))
        
        # Git statistics
        git_stats = self._get_git_stats()
        sections.append(self._format_git_stats(git_stats))
        
        # Language breakdown
        sections.append(self._format_language_breakdown(code_stats))
        
        return "\n".join(sections)

    def _get_code_stats(self) -> dict:
        """Analyze code files and gather statistics."""
        stats = {
            'total_files': 0,
            'total_lines': 0,
            'total_code_lines': 0,
            'total_comment_lines': 0,
            'total_blank_lines': 0,
            'by_language': defaultdict(lambda: {'files': 0, 'lines': 0, 'code': 0, 'comments': 0, 'blank': 0}),
            'file_list': [],
            'functions': {},  # function_name -> {'file': path, 'calls': count}
            'total_functions': 0,
            'total_function_calls': 0
        }
        
        # File extensions to analyze
        code_extensions = {
            '.py': 'Python',
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.jsx': 'JSX',
            '.tsx': 'TSX',
            '.java': 'Java',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C Header',
            '.hpp': 'C++ Header',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.scala': 'Scala',
            '.sh': 'Shell',
            '.bash': 'Bash',
            '.md': 'Markdown',
            '.json': 'JSON',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.xml': 'XML',
            '.html': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.sql': 'SQL',
        }
        
        # Directories to skip
        skip_dirs = {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'dist', 'build', '.egg-info', '.pytest_cache', 'data', '.DS_Store'}
        
        for root, dirs, files in os.walk('.'):
            # Remove skip directories
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in code_extensions:
                    filepath = os.path.join(root, file)
                    try:
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            lines = f.readlines()
                            
                        language = code_extensions[ext]
                        total = len(lines)
                        code, comments, blank = self._count_line_types(lines, ext)
                        
                        stats['total_files'] += 1
                        stats['total_lines'] += total
                        stats['total_code_lines'] += code
                        stats['total_comment_lines'] += comments
                        stats['total_blank_lines'] += blank
                        
                        stats['by_language'][language]['files'] += 1
                        stats['by_language'][language]['lines'] += total
                        stats['by_language'][language]['code'] += code
                        stats['by_language'][language]['comments'] += comments
                        stats['by_language'][language]['blank'] += blank
                        
                        stats['file_list'].append({
                            'path': filepath,
                            'language': language,
                            'lines': total
                        })
                        
                        # Analyze functions for Python files
                        if ext == '.py':
                            self._analyze_python_functions(filepath, lines, stats)
                        
                    except Exception:
                        pass
        
        # Calculate function statistics
        if stats['total_functions'] > 0:
            stats['avg_calls_per_function'] = stats['total_function_calls'] / stats['total_functions']
        else:
            stats['avg_calls_per_function'] = 0
        
        return stats

    def _analyze_python_functions(self, filepath: str, lines: list, stats: dict):
        """Analyze Python file for function definitions and calls."""
        try:
            source = ''.join(lines)
            tree = ast.parse(source, filename=filepath)
            
            # Find all function definitions
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    func_name = node.name
                    # Skip magic methods (dunder methods like __init__)
                    if not func_name.startswith('__'):
                        if func_name not in stats['functions']:
                            stats['functions'][func_name] = {'file': filepath, 'calls': 0}
                            stats['total_functions'] += 1
            
            # Find all function calls
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    # Handle simple function calls
                    if isinstance(node.func, ast.Name):
                        func_name = node.func.id
                        if func_name in stats['functions']:
                            stats['functions'][func_name]['calls'] += 1
                            stats['total_function_calls'] += 1
                    # Handle method calls (obj.method())
                    elif isinstance(node.func, ast.Attribute):
                        func_name = node.func.attr
                        if func_name in stats['functions']:
                            stats['functions'][func_name]['calls'] += 1
                            stats['total_function_calls'] += 1
        except Exception:
            # If parsing fails, skip this file
            pass
    
    def _count_line_types(self, lines: list, ext: str) -> tuple:
        """Count code, comment, and blank lines. Returns (code, comments, blank)."""
        code = 0
        comments = 0
        blank = 0
        in_block_comment = False
        
        # Comment patterns for different languages
        is_python = ext == '.py'
        is_c_like = ext in {'.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala'}
        is_html_like = ext in {'.html', '.xml', '.md'}
        
        for line in lines:
            stripped = line.strip()
            
            if not stripped:
                blank += 1
                continue
            
            # Handle block comments
            if is_c_like:
                if '/*' in stripped:
                    in_block_comment = True
                if '*/' in stripped:
                    in_block_comment = False
                    comments += 1
                    continue
                if in_block_comment:
                    comments += 1
                    continue
                if stripped.startswith('//'):
                    comments += 1
                    continue
            
            if is_python:
                if stripped.startswith('#'):
                    comments += 1
                    continue
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    comments += 1
                    continue
            
            if is_html_like:
                if stripped.startswith('<!--'):
                    comments += 1
                    continue
            
            code += 1
        
        return code, comments, blank

    def _get_git_stats(self) -> dict:
        """Gather git statistics."""
        stats = {
            'total_commits': 0,
            'contributors': 0,
            'branches': 0,
            'recent_commits': [],
            'error': None
        }
        
        try:
            # Check if git repo exists
            subprocess.run(['git', 'rev-parse', '--git-dir'], 
                         capture_output=True, check=True, timeout=5)
            
            # Total commits
            result = subprocess.run(['git', 'rev-list', '--count', 'HEAD'],
                                  capture_output=True, text=True, timeout=5)
            stats['total_commits'] = int(result.stdout.strip()) if result.stdout else 0
            
            # Contributors
            result = subprocess.run(['git', 'shortlog', '-sn'],
                                  capture_output=True, text=True, timeout=5)
            stats['contributors'] = len([l for l in result.stdout.strip().split('\n') if l])
            
            # Branches
            result = subprocess.run(['git', 'branch', '-a'],
                                  capture_output=True, text=True, timeout=5)
            stats['branches'] = len([l for l in result.stdout.strip().split('\n') if l])
            
            # Recent commits
            result = subprocess.run(['git', 'log', '--oneline', '-10'],
                                  capture_output=True, text=True, timeout=5)
            stats['recent_commits'] = [l.strip() for l in result.stdout.strip().split('\n') if l]
            
        except Exception as e:
            stats['error'] = str(e)
        
        return stats

    def _format_code_stats(self, stats: dict) -> str:
        """Format code statistics as markdown."""
        lines = ["## Code Metrics\n"]
        
        lines.append(f"- **Total Files:** {stats['total_files']}")
        lines.append(f"- **Total Lines:** {stats['total_lines']:,}")
        lines.append(f"- **Code Lines:** {stats['total_code_lines']:,}")
        lines.append(f"- **Comment Lines:** {stats['total_comment_lines']:,}")
        lines.append(f"- **Blank Lines:** {stats['total_blank_lines']:,}")
        
        if stats['total_lines'] > 0:
            code_pct = (stats['total_code_lines'] / stats['total_lines']) * 100
            comment_pct = (stats['total_comment_lines'] / stats['total_lines']) * 100
            lines.append(f"- **Code Ratio:** {code_pct:.1f}% code, {comment_pct:.1f}% comments")
        
        if stats['total_files'] > 0:
            avg_lines = stats['total_lines'] / stats['total_files']
            lines.append(f"- **Average File Size:** {avg_lines:.0f} lines")
        
        lines.append("")
        return "\n".join(lines)
    
    def _format_function_stats(self, stats: dict) -> str:
        """Format function statistics as markdown."""
        lines = ["## Function Analysis (Python)\n"]
        
        if stats['total_functions'] == 0:
            lines.append("No public functions found in Python files.\n")
            return "\n".join(lines)
        
        lines.append(f"- **Total Functions:** {stats['total_functions']}")
        lines.append(f"- **Total Function Calls:** {stats['total_function_calls']}")
        lines.append(f"- **Average Calls per Function:** {stats['avg_calls_per_function']:.2f}")
        
        # Calculate reuse score
        # Higher score = better reuse (more calls per function)
        # Score interpretation:
        # < 1.0: Poor reuse (functions called less than once on average)
        # 1.0-2.0: Low reuse
        # 2.0-5.0: Moderate reuse
        # 5.0+: Good reuse
        reuse_score = stats['avg_calls_per_function']
        if reuse_score < 1.0:
            reuse_rating = "Poor"
            reuse_color = "🔴"
        elif reuse_score < 2.0:
            reuse_rating = "Low"
            reuse_color = "🟠"
        elif reuse_score < 5.0:
            reuse_rating = "Moderate"
            reuse_color = "🟡"
        else:
            reuse_rating = "Good"
            reuse_color = "🟢"
        
        lines.append(f"- **Code Reuse Score:** {reuse_score:.2f} {reuse_color} ({reuse_rating})")
        lines.append("")
        lines.append("*Higher scores indicate better code reuse. Many functions with few calls suggests code duplication.*")
        
        # Show top called functions
        sorted_funcs = sorted(stats['functions'].items(), 
                            key=lambda x: x[1]['calls'], reverse=True)
        
        if sorted_funcs:
            lines.append("\n### Most Called Functions\n")
            lines.append("| Function | Calls | File |")
            lines.append("|----------|-------|------|")
            
            for func_name, data in sorted_funcs[:10]:
                file_short = data['file'].replace('./', '')
                lines.append(f"| `{func_name}` | {data['calls']} | {file_short} |")
        
        # Show unused functions
        unused = [name for name, data in stats['functions'].items() if data['calls'] == 0]
        if unused:
            lines.append(f"\n### Unused Functions ({len(unused)})\n")
            lines.append("These functions are defined but never called:\n")
            for func_name in sorted(unused)[:20]:
                file_short = stats['functions'][func_name]['file'].replace('./', '')
                lines.append(f"- `{func_name}` in {file_short}")
            if len(unused) > 20:
                lines.append(f"\n*...and {len(unused) - 20} more*")
        
        lines.append("")
        return "\n".join(lines)

    def _format_git_stats(self, stats: dict) -> str:
        """Format git statistics as markdown."""
        lines = ["## Git Statistics\n"]
        
        if stats['error']:
            lines.append(f"*Not a git repository or git not available: {stats['error']}*\n")
            return "\n".join(lines)
        
        lines.append(f"- **Total Commits:** {stats['total_commits']}")
        lines.append(f"- **Contributors:** {stats['contributors']}")
        lines.append(f"- **Branches:** {stats['branches']}")
        
        if stats['recent_commits']:
            lines.append("\n### Recent Commits\n")
            for commit in stats['recent_commits'][:5]:
                lines.append(f"- {commit}")
        
        lines.append("")
        return "\n".join(lines)

    def _format_language_breakdown(self, stats: dict) -> str:
        """Format language breakdown as markdown."""
        lines = ["## Language Breakdown\n"]
        
        if not stats['by_language']:
            lines.append("No code files found.\n")
            return "\n".join(lines)
        
        # Sort by lines of code
        sorted_langs = sorted(stats['by_language'].items(), 
                            key=lambda x: x[1]['lines'], reverse=True)
        
        lines.append("| Language | Files | Lines | Code | Comments |")
        lines.append("|----------|-------|-------|------|----------|")
        
        for lang, data in sorted_langs:
            lines.append(f"| {lang} | {data['files']} | {data['lines']:,} | {data['code']:,} | {data['comments']:,} |")
        
        lines.append("")
        return "\n".join(lines)
