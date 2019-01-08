--- Turbo.lua Escape module
--
-- Copyright John Abrahamsen 2011, 2012, 2013 < JhnAbrhmsn@gmail.com >
--
-- "Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE."

local escape = {} -- escape namespace

local function _unhex(hex) return string.char(tonumber(hex, 16)) end
--- Unescape a escaped hexadecimal representation string.
-- @param s (String) String to unescape.
function escape.unescape(s)
	return string.gsub(s, "%%(%x%x)", _unhex)
end

local function _hex(c)
	return string.format("%%%02x", string.byte(c))
end
--- Encodes a string into its escaped hexadecimal representation.
-- @param s (String) String to escape.
function escape.escape(s)
	return string.gsub(s, "([^A-Za-z0-9_])", _hex)
end

--- Encodes the HTML entities in a string. Helpfull to avoid XSS.
-- @param s (String) String to escape.
function escape.html_escape(s)
	assert("Expected string in argument #1.")
	return (string.gsub(s, "[}{\">/<'&]", {
		["&"] = "&amp;",
		["<"] = "&lt;",
		[">"] = "&gt;",
		['"'] = "&quot;",
		["'"] = "&#39;",
		["/"] = "&#47;"
	}))
end

-- Remove trailing and leading whitespace from string.
-- @param s String
function escape.trim(s)
	-- from PiL2 20.4
	return (s:gsub("^%s*(.-)%s*$", "%1"))
end

-- Remove leading whitespace from string.
-- @param s String
function escape.ltrim(s)
	return (s:gsub("^%s*", ""))
end

-- Remove trailing whitespace from string.
-- @param s String
function escape.rtrim(s)
	local n = #s
	while n > 0 and s:find("^%s", n) do n = n - 1 end
	return s:sub(1, n)
end

return escape