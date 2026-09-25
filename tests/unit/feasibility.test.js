// Unit tests for your feasibility algorithm.
// Run with: npm run test:unit
//
// Write small cases you have checked by hand, then make the code pass them.
// Each case below is a placeholder: replace { todo } with a real test body.
import { test } from 'node:test';
// import assert from 'node:assert/strict';
// import { checkFeasibility } from '../../server/services/feasibility.js';

test('accepts an order when there is enough stock for all committed orders', { todo: 'write this case' });

test('rejects an order that would leave an earlier-due order short', { todo: 'write this case' });

test('reports which material runs short and by how much', { todo: 'write this case' });

test('ignores completed orders when counting committed stock', { todo: 'write this case' });

test('handles level-tracked materials according to our team rule', { todo: 'write this case' });
