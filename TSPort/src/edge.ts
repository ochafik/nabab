import Immutable = require('immutable');

export interface EdgeValues<E, V> {  
    readonly from: V;
    readonly to: V;
    readonly value?: E;
}

export interface Edge<E, V> extends EdgeValues<E, V> {
    __edge_guard__: any;
}
export const Edge = Immutable.Record({
    from: "?",
    to: "?",
    value: undefined
}) as any as {
    new<E, V>(args: EdgeValues<E, V>): Edge<E, V>;
};

export function flipEdge<E, V>(edge: Edge<E, V>): Edge<E, V> {
    return new Edge({from: edge.to, to: edge.from, value: edge.value});
}

// function typedRecord<T>(defaultValues: T): 
