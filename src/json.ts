// adapted from https://raw.githubusercontent.com/kazuki/typescript-json-parser/master/json_parser.ts

export class JsonParser {
    static parse(s: string): any {
        try {
            return JSON.parse(s);
        } catch (e) {}
        return this._parse(s);
    }

    static _parse(s: string): any {
        var tokenizer = new JsonTokenizer(s);
        var type: TokenType = tokenizer.next();
        var ret: any;
        var stack: Array<any> = [];
        var state: ParserState;
        var key: string = null;
        var value: any = null;

        if (type == TokenType.String || type == TokenType.Number ||
            type == TokenType.True || type == TokenType.False ||
            type == TokenType.Null)
            return tokenizer.token;
        if (type == TokenType.BeginObject) {
            ret = {};
            value = ret;
            state = ParserState.Key;
        } else if (type == TokenType.BeginArray) {
            ret = [];
            value = ret;
            state = ParserState.Value;
        } else {
            throw TypeError('invalid root value type');
        }

        while ((type = tokenizer.next())) {
            switch (state) {
            case ParserState.Key:
                if (type == TokenType.String) {
                    key = tokenizer.token;
                    state = ParserState.NameSeparator;
                } else if (type == TokenType.EndObject) {
                    if (stack.length == 0)
                        return ret;
                    [state, key, value] = stack.pop();
                } else {
                    throw TypeError('invalid object key');
                }
                break;
            case ParserState.NameSeparator:
                if (type != TokenType.NameSeparator)
                    throw TypeError('invalid name separator');
                state = ParserState.Value;
                break;
            case ParserState.ArrayValueSeparator:
                if (type == TokenType.ValueSeparator) {
                    state = ParserState.Value;
                } else if (type == TokenType.EndArray) {
                    if (stack.length == 0)
                        return ret;
                    [state, key, value] = stack.pop();
                } else {
                    throw TypeError('invalid array value separator');
                }
                break;
            case ParserState.ObjectValueSeparator:
                if (type == TokenType.ValueSeparator) {
                    state = ParserState.Key;
                } else if (type == TokenType.EndObject) {
                    if (stack.length == 0)
                        return ret;
                    [state, key, value] = stack.pop();
                } else {
                    throw TypeError('invalie object value separator');
                }
                break;
            case ParserState.Value:
                switch (type) {
                case TokenType.String:
                case TokenType.Number:
                case TokenType.True:
                case TokenType.False:
                case TokenType.Null:
                    if (key === null) {
                        value.push(tokenizer.token);
                        state = ParserState.ArrayValueSeparator;
                    } else {
                        value[key] = tokenizer.token;
                        state = ParserState.ObjectValueSeparator;
                    }
                    break;
                case TokenType.BeginObject:
                case TokenType.BeginArray:
                    var new_value;
                    if (type == TokenType.BeginObject) {
                        new_value = {};
                        state = ParserState.Key;
                    } else {
                        new_value = [];
                        state = ParserState.Value;
                    }
                    if (key === null) {
                        stack.push([ParserState.ArrayValueSeparator, key, value]);
                        value.push(new_value);
                    } else {
                        stack.push([ParserState.ObjectValueSeparator, key, value]);
                        value[key] = new_value;
                    }
                    key = null;
                    value = new_value;
                    break;
                default:
                    throw TypeError('invalid token in value');
                }
                break;
            }
        }
        throw TypeError('eof');
    }
}

class JsonTokenizer {
    s: string;
    pos: number = 0;
    token: any = null;

    constructor(s: string) {
        this.s = s;
    }

    static _is_hex(c: number): boolean {
        return (c >= 0x30 && c <= 0x39) ||
            (c >= 0x41 && c <= 0x46) ||
            (c >= 0x61 && c <= 0x66);
    }

    static _is_inf(s: string, i: number): number {
        var c = s.charCodeAt(i);
        if (c != 0x49 && c != 0x69)
            return 0;
        if (s.charCodeAt(i + 1) != 0x6e || s.charCodeAt(i + 2) != 0x66)
            return 0;
        if (i + 3 == s.length - 1 || s.charCodeAt(i + 3) != 0x69)
            return 3;
        if (s.charCodeAt(i + 4) != 0x6e || s.charCodeAt(i + 5) != 0x69 ||
            s.charCodeAt(i + 6) != 0x74 || s.charCodeAt(i + 7) != 0x79)
            return 0;
        return 8;
    }

    next(): TokenType {
        var s = this.s;
        for (var i = this.pos; i < s.length;) {
            var c = s.charCodeAt(i);

            // skip whitespace
            if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) {
                i += 1;
                continue;
            }

            // return structural characters
            if (c == 0x5b || c == 0x7b || c == 0x5d || c == 0x7d || c == 0x3a || c == 0x2c) {
                this.pos = i + 1;
                this.token = null;
                return <TokenType>c;
            }

            // return string
            if (c == 0x22) {
                var start = i;
                var end;
                for (var j = i + 1;;) {
                    var c2 = s.charCodeAt(j);
                    if (c2 == 0x22) {
                        end = j + 1;
                        break;
                    }

                    // check escape char
                    if (c2 == 0x5c) {
                        var es = s.charCodeAt(j + 1);
                        if (es == 0x22 || es == 0x5c || es == 0x2f || es == 0x62 ||
                            es == 0x66 || es == 0x6e || es == 0x72 || es == 0x74) {
                            j += 2;
                            continue;
                        }
                        if (es == 0x75 && JsonTokenizer._is_hex(s.charCodeAt(j + 2)) &&
                            JsonTokenizer._is_hex(s.charCodeAt(j + 3)) &&
                            JsonTokenizer._is_hex(s.charCodeAt(j + 4)) &&
                            JsonTokenizer._is_hex(s.charCodeAt(j + 5))) {
                            j += 6;
                            continue;
                        }
                        // invalid escape
                        throw TypeError('invalid escape char');
                    }
                    j += 1;
                }

                this.pos = end;
                this.token = JSON.parse(s.slice(start, end));
                return TokenType.String;
            }

            // return number
            if (c == 0x2d /* minus */ || (c >= 0x30 && c <= 0x39 /* zero/digit1-9 */)) {
                var is_float = false;
                var j = i;
                if (c == 0x2d) {
                    c = s.charCodeAt(++j);
                    if (c == 0x49 || c == 0x69) {
                        // negative inf
                        var r = JsonTokenizer._is_inf(s, j);
                        if (r > 0) {
                            this.pos = j + r;
                            this.token = -Infinity;
                            return TokenType.Number;
                        }
                    }
                    if (c < 0x30 || c > 0x39)
                        throw TypeError('invalid negative number');
                }
                if (c != 0x30) {
                    // digit1-9 *DIGIT
                    do {
                        c = s.charCodeAt(++j);
                    } while (c >= 0x30 && c <= 0x39);
                } else {
                    // zero
                    c = s.charCodeAt(++j);
                }
                if (c == 0x2e) {
                    // frac
                    c = s.charCodeAt(++j);
                    if (c < 0x30 || c > 0x39)
                        throw TypeError('invalid fraction');
                    do {
                        c = s.charCodeAt(++j);
                    } while (c >= 0x30 && c <= 0x39);
                    is_float = true;
                }
                if (c == 0x65 || c == 0x45) {
                    // exp
                    c = s.charCodeAt(++j);
                    if (c == 0x2d || c == 0x2b)
                        c = s.charCodeAt(++j);
                    if (c < 0x30 || c > 0x39)
                        throw TypeError('invalid exp');
                    do {
                        c = s.charCodeAt(++j);
                    } while (c >= 0x30 && c <= 0x39);
                    is_float = true;
                }
                this.pos = j;
                if (is_float) {
                    this.token = parseFloat(s.slice(i, j));
                } else {
                    this.token = parseInt(s.slice(i, j));
                }
                return TokenType.Number;
            }

            // true
            if (c == 0x74) {
                if (s.charCodeAt(i + 1) != 0x72 ||
                    s.charCodeAt(i + 2) != 0x75 ||
                    s.charCodeAt(i + 3) != 0x65)
                    throw TypeError('invalid token');
                this.pos = i + 4;
                this.token = true;
                return TokenType.True;
            }

            // false
            if (c == 0x66) {
                if (s.charCodeAt(i + 1) != 0x61 ||
                    s.charCodeAt(i + 2) != 0x6c ||
                    s.charCodeAt(i + 3) != 0x73 ||
                    s.charCodeAt(i + 4) != 0x65)
                    throw TypeError('invalid token');
                this.pos = i + 5;
                this.token = false;
                return TokenType.False;
            }

            // null
            if (c == 0x6e) {
                if (s.charCodeAt(i + 1) != 0x75 ||
                    s.charCodeAt(i + 2) != 0x6c ||
                    s.charCodeAt(i + 3) != 0x6c)
                    throw TypeError('invalid token');
                this.pos = i + 4;
                this.token = null;
                return TokenType.Null;
            }

            // NaN
            if (c == 0x4e) {
                if (s.charCodeAt(i + 1) != 0x61 ||
                    s.charCodeAt(i + 2) != 0x4e)
                    throw TypeError('invalid token');
                this.pos = i + 3;
                this.token = NaN;
                return TokenType.Number;
            }

            // Inf
            {
                var r = JsonTokenizer._is_inf(s, i);
                if (r > 0) {
                    this.pos = i + r;
                    this.token = Infinity;
                    return TokenType.Number;
                }
            }
            throw TypeError('invalid token');
        }
        return TokenType.EOS;
    }
}

const enum TokenType {
    BeginArray = 0x5b,
    BeginObject = 0x7b,
    EndArray = 0x5d,
    EndObject = 0x7d,
    NameSeparator = 0x3a,
    ValueSeparator = 0x2c,
    True = 0x74,
    False = 0x66,
    Null = 0x6e,
    Number = 0x01,
    String = 0x02,
    EOS = 0x00,
}

const enum ParserState {
    Key = 1,
    Value = 2,
    NameSeparator = 3,
    ArrayValueSeparator = 4,
    ObjectValueSeparator = 5,
}
