/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/* Copyright (c) 2007 Olivier Chafik, All Rights Reserved
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.  
 */
package com.ochafik.util;

import java.util.Arrays;
import java.util.Random;

/*
 * java -server -Xmx100m com.ochafik.util.BinarySearchUtils.Tests
 */
public class BinarySearchUtils {
	/// Testing statistics
	static long totalSteps, totalCalls;

	public static int binarySearchSun(int[] a, int key, int offset, int length) {
		int low = offset;
		int high = length-1;

		while (low <= high) {
			int mid = (low + high) >> 1;
		int midVal = a[mid];

		if (midVal < key)
			low = mid + 1;
		else if (midVal > key)
			high = mid - 1;
		else
			return mid; // key found
		}
		return -(low + 1);  // key not found.
	}
	/**
	 * Searches a sorted int array for a specified value,
	 * using an optimized binary search algorithm (which tries to guess
	 * smart pivots).<br/>
	 * The result is unspecified if the array is not sorted.<br/>
	 * The method returns an index where key was found in the array.
	 * If the array contains duplicates, this might not be the first occurrence.
	 * @see java.util.Arrays.sort(int[])
	 * @see java.util.Arrays.binarySearch(int[])
	 * @param array sorted array of integers
	 * @param key value to search for in the array
	 * @param offset index of the first valid value in the array
	 * @param length number of valid values in the array
	 * @return index of an occurrence of key in array, 
	 * 		or -(insertionIndex + 1) if key is not contained in array (<i>insertionIndex</i> is then the index at which key could be inserted).
	 */
	public static final int binarySearch(int[] array, int key, int offset, int length) {//min, int max) {
		if (length == 0) {
			return -1 - offset;
		}
//		if (true)
//			return binarySearchSun(array, key, offset, length);
		
		
		int min = offset, max = offset + length - 1;
		int minVal = array[min], maxVal = array[max];

		int nPreviousSteps = 0;

		// Uncomment these two lines to get statistics about the average number of steps in the test report :
		//totalCalls++;
		for (;;) {
			//totalSteps++;

			// be careful not to compute key - minVal, for there might be an integer overflow.
			if (key <= minVal) 
				return key == minVal ? min : -1 - min;
			
			if (key >= maxVal) 
				return key == maxVal ? max : -2 - max;

			assert min != max;

			int pivot;
			// A typical binarySearch algorithm uses pivot = (min + max) / 2.
			// The pivot we use here tries to be smarter and to choose a pivot close to the expectable location of the key.
			// This reduces dramatically the number of steps needed to get to the key.
			// However, it does not work well with a logaritmic distribution of values, for instance.
			// When the key is not found quickly the smart way, we switch to the standard pivot.
			if (nPreviousSteps != 3) {
				// NOTE: We cannot do the following operations in int precision, because there might be overflows.
				//       long operations are slower than float operations with the hardware this was tested on (intel core duo 2, JVM 1.6.0).
				//       Overall, using float proved to be the safest and fastest approach.
				pivot = min + 
				(int)((key - (float)minVal) / 
					  (maxVal - (float)minVal) * 
					  (max - min));
				
				nPreviousSteps++;
			} else {
				pivot = (min + max) >>> 1;
			}

			int pivotVal = array[pivot];

			// NOTE: do not store key - pivotVal because of overflows
			if (key > pivotVal) {
				min = pivot + 1;
				max--;
			} else if (key == pivotVal) {
				return pivot;
			} else {
				min++;
				max = pivot - 1;
			}
			maxVal = array[max];
			minVal = array[min];
		}
	}

	public static final int binarySearch(IntArray array, int key) {
		return binarySearch(array, key, 0, array.size());
	}

	//static long totalIntArrayLengths, totalIntArrayCalls;
	public static final int binarySearch(IntArray array, int key, int offset, int length) {//min, int max) {
		if (length == 0) {
			return -1 - offset;
		}
		//totalIntArrayCalls++;
		//totalIntArrayLengths += length;

		//if ((totalIntArrayCalls - ((totalIntArrayCalls / 1000000) * 1000000)) == 999999)
		//	System.out.println("# "+totalIntArrayCalls+ " calls to binarySearch : average length = " + (totalIntArrayLengths / totalIntArrayCalls));

		int[] aa = array.getBackingArray();
		if (aa != null)
			return binarySearch(aa, key, offset, length);
		
		int min = offset, max = offset + length - 1;
		int minVal = array.get(min), maxVal = array.get(max);

		int nPreviousSteps = 0;

		// Uncomment these two lines to get statistics about the average number of steps in the test report :
		//totalCalls++;
		for (;;) {
			//totalSteps++;

			// be careful not to compute key - minVal, for there might be an integer overflow.
			if (key <= minVal) return key == minVal ? min : -1 - min;
			if (key >= maxVal) return key == maxVal ? max : -2 - max;

			assert min != max;

			int pivot;
			// A typical binarySearch algorithm uses pivot = (min + max) / 2.
			// The pivot we use here tries to be smarter and to choose a pivot close to the expectable location of the key.
			// This reduces dramatically the number of steps needed to get to the key.
			// However, it does not work well with a logaritmic distribution of values, for instance.
			// When the key is not found quickly the smart way, we switch to the standard pivot.
			if (nPreviousSteps > 2) {
				pivot = (min + max) >>> 1;
				/*nPreviousSteps++;
				if (nPreviousSteps > 3) {
					System.out.println("nPreviousSteps = "+nPreviousSteps);
				}*/
				// stop increasing nPreviousSteps from now on
			} else {
				// NOTE: We cannot do the following operations in int precision, because there might be overflows.
				//       long operations are slower than float operations with the hardware this was tested on (intel core duo 2, JVM 1.6.0).
				//       Overall, using float proved to be the safest and fastest approach.
				pivot = min + (int)((key - (float)minVal) / (maxVal - (float)minVal) * (max - min));
				nPreviousSteps++;
			}

			int pivotVal = array.get(pivot);

			// NOTE: do not store key - pivotVal because of overflows
			if (key > pivotVal) {
				min = pivot + 1;
				max--;
			} else if (key == pivotVal) {
				return pivot;
			} else {
				min++;
				max = pivot - 1;
			}
			maxVal = array.get(max);
			minVal = array.get(min);
		}
	}

	public static class Tests {
		//static Random random = new Random(1); // deterministic seed for reproductible tests
		static Random random = new Random(System.currentTimeMillis());
		static int[] createSortedRandomarray(int size) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) array[i] = random.nextInt();
			Arrays.sort(array);
			return array;
		}
		static int[] createSortedRandomarray(int size, int minVal, int maxVal) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) array[i] = minVal + (int)(random.nextDouble() * (maxVal - (double)minVal));
			Arrays.sort(array);
			return array;
		}

		public static int[] createMissingRandomArray(int size, int minVal, int maxVal, int[] existing) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) {
				int v;
				do {
					v = minVal + (int)(random.nextDouble() * (maxVal - (double)minVal));
				} while (Arrays.binarySearch(existing, v) >= 0);
				
				array[i] = v;
			}
			Arrays.sort(array);
			return array;
		}
		static int[] createEmptiedSequentialarray(int size, float loadFactor) {
			IntVector list = new IntVector();
			for (int i = 0; i< size; i++) list.add(i);

			int nRemoves = (int)(size * (1 - loadFactor));
			for (int i = nRemoves; i-- != 0;) {
				list.remove((int)(random.nextDouble() * (list.size() - 1)));
			}
			return list.toArray();
		}
		static int[] createSequentialarray(int size) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) array[i] = i;
			return array;
		}
		static int[] createSequentialDuplicatesarray(int size, int duplicationDegree) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) array[i] = i / duplicationDegree;
			return array;
		}
		static int[] createLogarray(int size, int scale) {
			int[] array = new int[size];
			for (int i = size; i-- != 0;) array[i] = (int)(scale * Math.log(i + 1));
			return array;
		}


		static void runTest(String title, int[] array, int[] keys, int nTests) {
			//System.out.println("#\n# "+title+"\n#");
			System.out.println("# "+title);
			long initTime;

			initTime = System.nanoTime();
			searchAll_Olive(array, keys, nTests);
			long oliveTime = System.nanoTime() - initTime;
			//System.out.println("Olive : " + (elapsedTime / 1000) + " (" +((float)elapsedTime / nTests / keys.length) + " each)");

			initTime = System.nanoTime();
			searchAll_Java(array, keys, nTests);
			long javaTime = System.nanoTime() - initTime;
			//System.out.println(" Java : " + (elapsedTime2 / 1000) + " (" +((float)elapsedTime2 / nTests / keys.length) + " each)");

			initTime = System.nanoTime();
			searchAll_Whitness(array, keys, nTests);
			long whitnessTime = System.nanoTime() - initTime;

			javaTime -= whitnessTime;
			oliveTime -= whitnessTime;

			System.out.println("\t"+(javaTime > oliveTime ?
					"zOlive " + (((javaTime * 10) / oliveTime) / 10.0) + " x faster" : 
						"  Java " + (((oliveTime * 10) / javaTime) / 10.0) + " x faster") +
						(totalCalls == 0 ?
								"" :
									" (avg. of " + ((totalSteps * 100 / totalCalls) / 100.0) + " steps)"));

			//if (totalCalls != 0) System.out.println("Steps avg : " + ((totalSteps * 100 / totalCalls) / 100.0));
			totalSteps = 0;
			totalCalls = 0;
			//System.out.println();

		}

		static boolean validate_searchAll(int[] array) {
			int len = array.length;
			for (int i = len; i-- != 0;) {
				int key = array[i];
				int a = binarySearch(array, key, 0, len);
				if (a >= 0 && array[a] != key) {
					return false;
				}
				int b = Arrays.binarySearch(array, key);
				if (b >= 0 && array[b] != key) {
					return false;
				}

				// if key was not found, both implementations return values < 0
				// still, values might be different because of duplicates
				if ((a >= 0) != (b >= 0)) {
					return false;
				}

				// if key was not found, insertionIndex shall be the same in both implementations
				if (a < 0 && (a != b)) {
					return false;
				}
			}
			return true;
		}
		static int searchAll_Olive(int[] array, int[] keys, int times) {
			int r = 0;
			int len = keys.length, arrayLen = array.length;
			for (int t = times; t-- != 0;) {
				for (int i = len; i-- != 0;) {
					r ^= binarySearch(array, keys[i], 0, arrayLen);
				}
			}
			return r;	
		}
		static int searchAll_Whitness_sub(int[] array, int[] keys) {
			int r = 0;
			int len = keys.length, arrayLen = array.length;
			for (int i = len; i-- != 0;) {
				r ^= keys[i];
			}
			return r;	
		}
		static int searchAll_Whitness(int[] array, int[] keys, int times) {
			int r = 0;
			for (int t = times; t-- != 0;) {
				r ^= searchAll_Whitness_sub(array, keys);
			}
			return r;	
		}

		static int searchAll_Java(int[] array, int[] keys, int times) {
			int r = 0;
			int len = keys.length;
			for (int t = times; t-- != 0;) {
				for (int i = len; i-- != 0;) {
					r ^= Arrays.binarySearch(array, keys[i]);
				}
			}
			return r;
		}

	}

	/*public static final int binarySearchFirstOccurrence(int[] array, int key, int min, int max) {
		int i = binarySearch(array, key, min, max);
		while (i > 0) {
			int ii = i - 1;
			if (array[ii] != key) break;
			i = ii;
		}
		return i;
	}*/

	public static void main(String[] args) {

		// JVM WARMUP
		int nWarmup = 100000;
		int nTests = 30;
		int[] array, randomKeys, missingKeys;

		System.out.print("Warming up... ");
		array = Tests.createSortedRandomarray(100);
		Tests.searchAll_Java(array, array, nWarmup);
		Tests.searchAll_Olive(array, array, nWarmup);
		Tests.searchAll_Whitness(array, array, nWarmup);

		System.out.println("done.");

		totalCalls = totalSteps = 0;

		// TESTS
		int testSize = 100000, nKeys = 1000000, nValidations = 5, validationSize = 100000;
		for (int i = 0; i < nValidations; i++) {
			System.out.print("Validating ("+(i + 1)+" / "+nValidations +")... ");
			array = Tests.createSortedRandomarray(validationSize);
			boolean validated = Tests.validate_searchAll(array);
			System.out.println(validated ? "OK." : "FAILURE !!!");
			if (!validated) return;
		}
		System.out.print("Validating {min, max}... ");
		array = new int[] { Integer.MIN_VALUE, Integer.MAX_VALUE };
		boolean validated = Tests.validate_searchAll(array);
		System.out.println(validated ? "OK." : "FAILURE !!!");
		if (!validated) return;

		System.out.print("Validating {min, 0, max}... ");
		array = new int[] { Integer.MIN_VALUE, 0, Integer.MAX_VALUE };
		validated = Tests.validate_searchAll(array);
		System.out.println(validated ? "OK." : "FAILURE !!!");
		if (!validated) return;

		
		System.out.println("Size of data arrays = " + testSize);

		randomKeys = Tests.createSortedRandomarray(nKeys);
		missingKeys = Tests.createMissingRandomArray(nKeys, Integer.MIN_VALUE, Integer.MAX_VALUE, array);
		
		Tests.runTest("Random elements, search of existing elements", array, array, nTests);
		Tests.runTest("Random elements, search of random elements", array, randomKeys, nTests);
		Tests.runTest("Random elements, search of missing elements", array, missingKeys, nTests);

		System.out.println();

		array = Tests.createSequentialarray(testSize);
		missingKeys = Tests.createMissingRandomArray(nKeys, Integer.MIN_VALUE, Integer.MAX_VALUE, array);

		Tests.runTest("Sequential elements, search of existing elements", array, array, nTests);
		Tests.runTest("Sequential elements, search of random elements", array, randomKeys, nTests);
		Tests.runTest("Sequential elements, search of missing elements", array, missingKeys, nTests);

		System.out.println();

		array = Tests.createSequentialDuplicatesarray(testSize, 100);
		missingKeys = Tests.createMissingRandomArray(nKeys, Integer.MIN_VALUE, Integer.MAX_VALUE, array);

		Tests.runTest("Sequential duplicated elements, search of existing elements", array, array, nTests);
		Tests.runTest("Sequential duplicated elements, search of random elements", array, randomKeys, nTests);
		Tests.runTest("Sequential duplicated elements, search of missing elements", array, missingKeys, nTests);

		System.out.println();

		int scale = testSize;
		array = Tests.createLogarray(testSize, scale);
		randomKeys = Tests.createSortedRandomarray(nKeys, 0, (int)(scale * Math.log(testSize)));
		missingKeys = Tests.createMissingRandomArray(nKeys, Integer.MIN_VALUE, Integer.MAX_VALUE, array);

		for (int i = 1; i-- != 0;) {
			Tests.runTest("Logaritmic elements, search of existing elements", array, array, nTests);
			Tests.runTest("Logaritmic elements, search of random elements", array, randomKeys, nTests);
			Tests.runTest("Logaritmic elements, search of missing elements", array, missingKeys, nTests);

			System.out.println();
		}

		for (float loadFactor : new float[] {0.1f, 0.3f, 0.5f, 0.75f, 0.9f}) {
			array = Tests.createEmptiedSequentialarray(testSize, loadFactor);
			randomKeys = Tests.createSequentialarray(nKeys);
			missingKeys = Tests.createMissingRandomArray(nKeys, Integer.MIN_VALUE, Integer.MAX_VALUE, array);

			Tests.runTest("Sparse sequential elements (loadFactor = "+loadFactor+"), search of existing elements", array, array, nTests);
			Tests.runTest("Sparse sequential elements (loadFactor = "+loadFactor+"), sequential keys", array, randomKeys, nTests);
			Tests.runTest("Sparse sequential elements (loadFactor = "+loadFactor+"), missing elements", array, missingKeys, nTests);


			System.out.println();
		}
	}

}
