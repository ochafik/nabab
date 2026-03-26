package com.ochafik.math.bayes;

import com.ochafik.math.functions.*;
import com.ochafik.math.graph.*;
import java.util.*;
import java.net.URL;

/**
 * Headless test: runs inference and prints reference values for cross-validation.
 */
public class InferenceTest {
    public static void main(String[] args) throws Exception {
        URL url = InferenceTest.class.getResource("/com/ochafik/math/bayes/dogproblem.xml");
        List<BayesianNetwork> networks = XMLBIFReader.read(url);

        for (BayesianNetwork net : networks) {
            DefaultBayesianNetwork dnet = (DefaultBayesianNetwork) net;
            List<Variable> vars = net.getGraph().getNodeList();
            System.out.println("=== Network: " + vars.size() + " variables ===");
            for (Variable v : vars) {
                System.out.println("  " + v.getName() + " " + v.getValues());
            }

            // --- PRIORS ---
            System.out.println("\n--- PRIORS ---");
            dnet.infer();
            printPosteriors(dnet, vars, "");

            // --- Evidence: hear_bark=true ---
            System.out.println("\n--- POSTERIOR hear_bark=true ---");
            dnet.getObservations().clear();
            Variable hearBark = findVar(vars, "hear_bark");
            if (hearBark != null) {
                Map<Integer, Float> obs = new HashMap<>();
                obs.put(0, 1.0f); // true = index 0
                obs.put(1, 0.0f); // false = index 1
                dnet.getObservations().put(hearBark, obs);
                dnet.infer();
                printPosteriors(dnet, vars, "hear_bark=true");
            }

            // --- Evidence: dog_out=false ---
            System.out.println("\n--- POSTERIOR dog_out=false ---");
            dnet.getObservations().clear();
            dnet.inferences.clear();
            Variable dogOut = findVar(vars, "dog_out");
            if (dogOut != null) {
                Map<Integer, Float> obs = new HashMap<>();
                obs.put(0, 0.0f); // true
                obs.put(1, 1.0f); // false
                dnet.getObservations().put(dogOut, obs);
                dnet.infer();
                printPosteriors(dnet, vars, "dog_out=false");
            }

            // --- Evidence: family_out=true ---
            System.out.println("\n--- POSTERIOR family_out=true ---");
            dnet.getObservations().clear();
            dnet.inferences.clear();
            Variable familyOut = findVar(vars, "family_out");
            if (familyOut != null) {
                Map<Integer, Float> obs = new HashMap<>();
                obs.put(0, 1.0f);
                obs.put(1, 0.0f);
                dnet.getObservations().put(familyOut, obs);
                dnet.infer();
                printPosteriors(dnet, vars, "family_out=true");
            }
        }
    }

    static Variable findVar(List<Variable> vars, String name) {
        for (Variable v : vars) if (v.getName().equals(name)) return v;
        return null;
    }

    static void printPosteriors(DefaultBayesianNetwork dnet, List<Variable> vars, String label) throws Exception {
        Valuation<Variable> known = BayesianNetworkUtils.getKnownValues(dnet);
        for (Variable v : vars) {
            Function<Variable> inf = dnet.getInferences().get(v);
            if (inf == null) continue;
            double[] probs = BayesianNetworkUtils.getProbabilities(v, inf, known);
            List<Object> values = v.getValues();
            System.out.print("P(" + v.getName() + ") = ");
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) System.out.print(", ");
                System.out.printf("%s=%.6f", values.get(i), probs[i]);
            }
            System.out.println();
        }
    }
}
