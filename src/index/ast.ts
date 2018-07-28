import { count } from "../helpers";

export enum NodeType {
    Unknown = "UNKNOWN",
    Node = "NODE",
    Item = "ITEM",
    Key = "KEY",
    Value = "VALUE",
    List = "LIST"
}

export type VisitorFunc = (type: NodeType, node: any, path: VisitedNode[], index?: number, array?: any[]) => void;
export type VisitedNode = { type: NodeType, node: any };

function walkInternal(node: any, visitor: VisitorFunc, type: NodeType, path: VisitedNode[], index?: number, array?: any[]) {
    visitor(type, node, path, index, array);
    const current = [{ type: type, node: node }];

    if (node.hasOwnProperty("Node")) {
        walkInternal(node.Node, visitor, NodeType.Node, path.concat(current));
    } else if (node.hasOwnProperty("Items")) {
        node.Items.forEach((item, idx, items) => {
            walkInternal(item, visitor, NodeType.Item, path.concat(current), idx, items);
        });
    } else if (node.hasOwnProperty("Keys")) {
        node.Keys.forEach((key, idx, keys) => {
            walkInternal(key, visitor, NodeType.Key, path.concat(current), idx, keys);
        });
        if (node.Val)
            walkInternal(node.Val, visitor, NodeType.Value, path.concat(current));
    } else if (node.hasOwnProperty("List")) {
        walkInternal(node.List, visitor, NodeType.List, path.concat(current));
    } else if (type === NodeType.List) {
        // value list
        node.forEach((value, idx, values) => {
            walkInternal(value, visitor, NodeType.Value, path.concat(current), idx, values);
        });
    }
}

export function walk(ast: Ast, visitor: VisitorFunc) {
    return walkInternal(ast, visitor, NodeType.Unknown, []);
}

export interface Ast {
    Node: AstList;
}

export interface AstPosition {
    Filename: string;
    Offset: number;
    Line: number;
    Column: number;
}

export function createPosition(line: number, column: number): AstPosition {
    return {
        Filename: "",
        Offset: 0,
        Line: line,
        Column: column
    };
}

export enum AstTokenType {
    ILLEGAL = 0,
    EOF,
    COMMENT,

    identifier_begin,
    IDENT,
    literal_begin,
    NUMBER,
    FLOAT,
    BOOL,
    STRING,
    HEREDOC,
    literal_end,
    identifier_end,

    operator_begin,
    LBRACK, // [
    LBRACE, // {
    COMMA,
    PERIOD,
    RBRACK, // ]
    RBRACE, // }
    ASSIGN,
    ADD,
    SUB,
    operator_end
}

export interface AstToken {
    Type: AstTokenType;
    Pos: AstPosition;
    Text: string;
    JSON: boolean;
}

export function createToken(type: AstTokenType, text: string, line: number, column: number): AstToken {
    return {
        Type: type,
        Text: text,
        JSON: false,
        Pos: {
            Filename: "",
            Offset: 0,
            Line: line,
            Column: column
        }
    };
}

export interface AstList {
    Items: AstItem[];
}

export interface AstTokenItem {
    Token: AstToken;
    LeadComment: any;
    LineComment: any;
}

export interface AstVal {
    Lbrace: AstPosition | null;
    Rbrace: AstPosition | null;
    Lbrack: AstPosition | null;
    Rbrack: AstPosition | null;
    List?: AstList | AstTokenItem[];
    Token?: AstToken;
    LeadComment: any;
    LineComment: any;
}

export enum AstValueType {
    Map,
    List,
    String
}

export interface AstKey {
    Token: AstToken;
}

export interface AstItem {
    Keys: AstKey[];
    Assign: AstPosition;
    Val: AstVal,
    LeadComment: any;
    LineComment: any;
}

export function getText(token: AstToken, options?: { stripQuotes: boolean }): string {
    if (options && options.stripQuotes) {
        if (token.Type === 9) {
            return token.Text.substr(1, token.Text.length - 2);
        }
    }

    return token.Text;
}

export function getStringValue(value: AstVal, fallback: string, options?: { stripQuotes: boolean }): string {
    if (!value)
        return fallback;

    if (value.Token)
        return getText(value.Token, options);

    return fallback;
}

export function getMapValue(value: AstVal, options?: { stripQuotes: boolean }): Map<string, string> {
    let astList = value.List as AstList;
    let map = new Map<string, string>();

    if (!astList || !astList.Items)
        return map;
    astList.Items.forEach((item) => {
        let k = getText(item.Keys[0].Token);
        let v = getStringValue(item.Val, undefined, options);

        if (v !== undefined) {
            map.set(k, v);
        }
    });
    return map;
}

export function getValueType(value: AstVal): AstValueType {
    if (value.Token)
        return AstValueType.String;

    let list = value.List as AstList;
    if (list.Items)
        return AstValueType.Map;

    return AstValueType.List;
}

export function getValue(value: AstVal, options?: { stripQuotes: boolean }): string | string[] | Map<string, string> {
    if (value.Token)
        return getText(value.Token, options);

    // map
    let astList = value.List as AstList;
    if (astList.Items) {
        return getMapValue(value, options);
    }

    // array
    let tokens = value.List as AstTokenItem[];
    return tokens.map((t) => getText(t.Token, options));
}

export function findValue(item: AstItem, name?: string): AstVal {
    if (!name) {
        return item.Val;
    }

    let values = (item.Val.List as AstList).Items;
    if (!values) {
        return null;
    }

    let value = values.find((v) => getText(v.Keys[0].Token) === name);
    if (!value)
        return null;
    return value.Val;
}

export function splitTokenAtPosition(token: AstToken, pos: AstPosition): [string, string] {
    const lineDiff = pos.Line - token.Pos.Line;
    const lines = token.Text.split('\n');
    const lastLine = lines[lines.length - 1];
    if (lineDiff < 0 || lineDiff > lines.length)
        return [null, null];
    if (!lineDiff && pos.Column < token.Pos.Column)
        return [null, null];
    if (lineDiff === lines.length - 1 && pos.Column >= token.Pos.Column + lastLine.length)
        return [null, null];

    // single line token
    if (lines.length === 1) {
        const offset = pos.Column - token.Pos.Column;
        return [token.Text.substr(0, offset), token.Text.substr(offset)];
    }

    let prefix = lines.slice(0, lineDiff);
    let suffix = lines.slice(lineDiff + 1);

    let hitPrefix = lines[lineDiff].substr(0, pos.Column - 1);
    let hitSuffix = lines[lineDiff].substr(pos.Column - 1);

    return [[...prefix, hitPrefix].join('\n'), [hitSuffix, ...suffix].join('\n')];
}

export function getTokenAtPosition(ast: Ast, pos: AstPosition, allowedTypes: "ALL" | AstTokenType[]): AstToken {
    let found: AstToken = null;
    walk(ast, (type: NodeType, node: any, path: VisitedNode[]) => {
        if (node.Token && path.findIndex((n) => n.type === NodeType.Value) !== -1) {
            let token = node.Token as AstToken;
            if (allowedTypes !== "ALL" && allowedTypes.indexOf(token.Type) === -1) {
                return;
            }

            if (token.Type === AstTokenType.COMMENT) {
                // multiline tokens
                const numLines = count(token.Text, '\n');
                if (pos.Line === token.Pos.Line) {
                    if (pos.Column >= token.Pos.Column) {
                        found = token;
                    }
                } else if (pos.Line > token.Pos.Line && pos.Line <= (token.Pos.Line + numLines)) {
                    found = token;
                }
            } else if (token.Type === AstTokenType.HEREDOC) {
                // multiline token, do not include first and last line of token as they include START and END marker
                const numLines = count(token.Text, '\n') - 1; // -1 because the end of heredoc token includes the newline
                if (pos.Line > token.Pos.Line && pos.Line < (token.Pos.Line + numLines)) {
                    found = token;
                }
            } else {
                // single line tokens
                if (pos.Line !== token.Pos.Line)
                    return;

                if (token.Pos.Column < pos.Column && (token.Pos.Column + token.Text.length) > pos.Column) {
                    found = token;
                }
            }
        }
    });
    return found;
}