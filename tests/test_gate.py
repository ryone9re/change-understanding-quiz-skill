import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'skills/change-understanding-quiz-skill/scripts/gate.py'
spec = importlib.util.spec_from_file_location('gate', SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='understanding quiz ')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.run_git('init', '-b', 'main')
        self.run_git('config', 'user.name', 'Quiz Test')
        self.run_git('config', 'user.email', 'quiz@example.invalid')
        self.commit('before')
        self.run_git('switch', '-c', 'feature')
        self.commit('after')

    def run_git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.PIPE, text=True).strip()

    def commit(self, text):
        (self.repo / 'behavior.txt').write_text(text)
        self.run_git('add', 'behavior.txt')
        self.run_git('commit', '-m', text)

    def record(self):
        return {
            'snapshot': gate.snapshot(self.repo, 'main'),
            'questions': [
                {'category': 'spec', 'question': 'What result changes?', 'answer': 'after', 'correct': True, 'reason': 'behavior.txt changes the result'},
                {'category': 'technical', 'question': 'Where does the result come from?', 'answer': 'behavior.txt', 'correct': True, 'reason': 'The value is read from this file'},
            ],
        }

    def hook(self, command):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            gate.hook({'hook_event_name': 'PreToolUse', 'tool_name': 'Bash', 'cwd': str(self.repo), 'tool_input': {'command': command}})
        return json.loads(output.getvalue()) if output.getvalue() else None

    def test_quiz_pass_then_pr_creation(self):
        command = 'gh pr create --base main --title "Change result"'
        self.assertEqual(self.hook(command)['hookSpecificOutput']['permissionDecision'], 'deny')
        record = self.record()
        gate.record_pass(self.repo, 'main', record)
        self.assertEqual(gate.check(self.repo, 'main'), record)
        self.assertIn('全問正解済み', self.hook(command)['hookSpecificOutput']['additionalContext'])
        # Run the actual CLI through the hook's documented JSON stdin protocol.
        event = {'hook_event_name': 'PreToolUse', 'tool_name': 'Bash', 'cwd': str(self.repo), 'tool_input': {'command': command}}
        result = subprocess.run(['python3', str(SCRIPT), 'hook'], input=json.dumps(event), text=True, capture_output=True, check=True)
        self.assertIn('全問正解済み', json.loads(result.stdout)['hookSpecificOutput']['additionalContext'])

    def test_wrong_answer_requires_retry(self):
        record = self.record()
        record['questions'][0]['correct'] = False
        with self.assertRaises(ValueError):
            gate.record_pass(self.repo, 'main', record)
        record['questions'][0].update(correct=True, answer='after, following the retry example')
        gate.record_pass(self.repo, 'main', record)
        self.assertEqual(gate.check(self.repo, 'main')['questions'][0]['answer'], record['questions'][0]['answer'])

    def test_edits_and_new_commit_require_new_quiz(self):
        record = self.record()
        gate.record_pass(self.repo, 'main', record)
        (self.repo / 'behavior.txt').write_text('third result')
        self.assertEqual(self.hook('gh pr create --base main')['hookSpecificOutput']['permissionDecision'], 'deny')
        self.commit('third result')
        with self.assertRaises(ValueError):
            gate.record_pass(self.repo, 'main', record)
        new_record = self.record()
        gate.record_pass(self.repo, 'main', new_record)
        self.assertIn('全問正解済み', self.hook('gh pr create --base=main --draft')['hookSpecificOutput']['additionalContext'])

    def test_updated_remote_base_requires_new_quiz(self):
        self.run_git('update-ref', 'refs/remotes/origin/main', self.run_git('rev-parse', 'main'))
        gate.record_pass(self.repo, 'main', self.record())
        self.run_git('update-ref', 'refs/remotes/origin/main', self.run_git('rev-parse', 'HEAD'))
        self.assertEqual(self.hook('gh pr create --base main')['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_creation_targets_must_match_quiz(self):
        gate.record_pass(self.repo, 'main', self.record())
        for command in ['gh pr create', 'gh pr create --base other', 'gh pr create --base main --repo other/repo', 'gh pr create --base main --head other', 'cd ../other && gh pr create --base main']:
            with self.subTest(command=command):
                self.assertEqual(self.hook(command)['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_session_reminder_and_mcp_guidance(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            gate.hook({'hook_event_name': 'SessionStart'})
        self.assertIn('$change-understanding-quiz-skill', json.loads(output.getvalue())['hookSpecificOutput']['additionalContext'])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            gate.hook({'tool_name': 'mcp__github__create_pull_request'})
        self.assertEqual(json.loads(output.getvalue())['hookSpecificOutput']['permissionDecision'], 'deny')


if __name__ == '__main__':
    unittest.main()
