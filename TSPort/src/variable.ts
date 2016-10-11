import * as Immutable from 'immutable';
// import {assert, assertThat} from './asserts';

type Position = {readonly x: number, readonly y: number};
interface VariableValues {  
    readonly name: string;
    readonly outcomes: ReadonlyArray<string>;
    readonly position?: Position;
}
const defaultVariableValues: VariableValues = {
    name: "?",
    outcomes: [],
    position: undefined
}

export class Variable extends Immutable.Record(defaultVariableValues) {
    readonly name: string;
    readonly outcomes: ReadonlyArray<string>;
    readonly position?: Position;
    constructor(values: VariableValues) {
        super(values);
    }
    toString() {
        return this.name;
    }
}

export type Observations = Immutable.Map<Variable, string>;

export type Distribution = Immutable.Map<string, number>;

interface VariableLikelihoodValues {
    readonly variable: Variable;
    readonly dependencies: ReadonlyArray<Variable>;
    readonly distributions: Immutable.Map<Observations, Distribution>;
}
export class VariableLikelihood extends Immutable.Record({variable: null, dependencies: null, distributions: null}) {
    readonly variable: Variable;
    readonly dependencies: ReadonlyArray<Variable>;
    readonly distributions: Immutable.Map<Observations, Distribution>;

    constructor(values: VariableLikelihoodValues) {
      super(values);

    //   for (const key of values.distributions.keySeq().toArray()) {
    //       if ()
    //   }
    //   assert(() => values.distributions.keySeq().every(map => Immutable.is(values.dependencies, map!.keySeq().toSet())));
    }

    toString() {
        return `variable(${this.variable.name}) {\n` +
            // this.variable.outcomes.join(', ') + ':\n' + 
            this.distributions.keySeq().map(params =>
                `(${params!.map((v, n) => `${n}=${v}`).join(', ')}): ${this.getDistribution(params!).map((v, n) => `${this.variable.name}=${n}: ${v}`).join(', ')}`).join('\n') + '\n' +
            '}'; 
    }
        
    getDistribution(observations: Observations): Distribution {
        const result = this.distributions.get(observations);
        if (result == null) {
            throw new Error(`No values for ${observations.toString()}`);
        }
        return result;
    }
}
