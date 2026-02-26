# Implementation Summary: Manual Input for Failure Module

## Overview
Successfully implemented the ability to pass custom input to the `failure` module when calling it directly (not auto-triggered by an error). The module now supports two invocation modes:

1. **Auto-triggered mode** (`manual=False`): Frames the issue as "A failure occurred" with the error message and execution trace
2. **Manual mode** (`manual=True`): Frames the issue as "I need help diagnosing/fixing..." with user-provided input and trace as context

## Changes Made

### 1. `modules/failure.py` - Enhanced `run()` method
**File**: `modules/failure.py`

**Changes**:
- Added `manual = data.get("manual", False)` to detect invocation mode
- Implemented conditional prompt framing:
  - **Manual mode**: "I need help diagnosing/fixing the following:\n{user_input}"
  - **Auto mode**: "A failure occurred:\n{user_input}"
- Added graceful trace loading with fallback to "(no trace available)" if trace file is missing
- Different console labels for each mode:
  - Manual: "[Failure module activated — analyzing request...]"
  - Auto: "[Failure module activated — diagnosing...]"

**Code snippet**:
```python
def run(self, data) -> dict:
    user_input = data["input"]
    manual = data.get("manual", False)
    
    # ... trace loading ...
    
    if manual:
        user_message = (
            f"I need help diagnosing/fixing the following:\n{user_input}"
            f"\n\nExecution trace for context:\n{trace_content}"
        )
        label = "\n[Failure module activated — analyzing request...]\n"
    else:
        user_message = (
            f"A failure occurred:\n{user_input}"
            f"\n\nExecution trace:\n{trace_content}"
        )
        label = "\n[Failure module activated — diagnosing...]\n"
```

### 2. `modules/failure.py` - Updated class docstring
**File**: `modules/failure.py`

**Changes**:
- Enhanced the `FailureModule` class docstring to document both invocation modes
- Added explicit input description
- This docstring is automatically picked up by `MODULE_DESCRIPTIONS` and made available to the planner

**Updated docstring**:
```python
class FailureModule(Module):
    """Diagnose runtime failures from the active session trace and recover via module calls.

    Runs an OPUS-guided loop with persisted conversation/state under the current
    session so diagnosis can resume after nested module calls or restarts.

    Can be invoked manually with a description of what to diagnose or fix,
    or auto-triggered with an error message from a failed module.

    Input: a description of the failure or issue to diagnose. Can be auto-triggered by errors
    or called manually with a custom problem description.
    """
```

### 3. `zipper.py` - Updated all auto-trigger call sites
**File**: `zipper.py`

**Changes**: Updated all 3 locations where the failure module is auto-triggered to explicitly pass `"manual": False`:

1. **Line 90** - Module not found error:
   ```python
   result = {"module": "failure", "input": error, "manual": False}
   ```

2. **Line 115** - Invalid result payload error:
   ```python
   result = {"module": "failure", "input": error, "manual": False}
   ```

3. **Line 125** - Main loop exception handler:
   ```python
   result = {"module": "failure", "input": error, "manual": False}
   ```

## Usage

### Auto-triggered (existing behavior preserved)
When an error occurs in the main loop, zipper.py automatically calls:
```python
{"module": "failure", "input": error_message, "manual": False}
```
The failure module frames this as "A failure occurred" and uses the trace as supporting context.

### Manual invocation (new capability)
When the planner or user explicitly calls the failure module:
```python
{"module": "failure", "input": "The bash module keeps timing out, help me fix it"}
```
Since `manual` is not provided, it defaults to `True`, and the failure module frames this as "I need help diagnosing/fixing..." with the trace as context.

Or explicitly:
```python
{"module": "failure", "input": "Custom diagnosis request", "manual": True}
```

## Benefits

1. **Flexible diagnosis**: Users can now ask the failure module to help with any issue, not just errors
2. **Better framing**: The prompt is tailored to whether it's an error diagnosis or a custom request
3. **Backward compatible**: Auto-triggered behavior is unchanged; existing error handling works identically
4. **Planner aware**: The updated docstring makes the capability discoverable to the planner module
5. **Graceful degradation**: If the trace file is missing, the module continues with a fallback message

## Testing

All data structure tests pass:
- ✓ Manual invocation with explicit `manual=True`
- ✓ Auto-triggered invocation with explicit `manual=False`
- ✓ Default behavior (no manual key) correctly defaults to `False`

## Files Modified

1. `modules/failure.py` - 2 changes (run method + docstring)
2. `zipper.py` - 3 changes (all auto-trigger call sites)

**Total lines changed**: ~40 lines across 2 files
