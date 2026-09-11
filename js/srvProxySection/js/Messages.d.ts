export type GUID = string;
export type Timestamp = string;
export type UserID = string;

export interface TypeTarget {
    id: GUID;
    name: string;
}

export interface Cell {
    row: number;
    column: number;
    quantity: number;
    itemID: GUID;
}

export interface Order {
    Target: TypeTarget;
    Command: string;
    Cells: Cell[];
}

export interface Transaction {
    ID: GUID;
    Timestamp: Timestamp;
    UserID: UserID;
    Source: string;
    Orders: Order[];
}

export interface Response {
    ID: GUID;
    ParentID: GUID;
    Timestamp: Timestamp;
    Target: TypeTarget;
    Cell: Cell;
    Result: "OK" | "ERROR" | "PARTIAL";
    Message: string;
}