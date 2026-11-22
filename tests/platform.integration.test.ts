import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAppServer } from '../server.ts';
import { resetSqliteInstanceForTests, getSqliteDb } from '../server/db/sqliteAdapter.ts';
import { runDuePublicationsOnce } from '../server/jobs/publicationScheduler.ts';
import { extractGoogleDriveId } from '../src/lib/videoUrl.ts';

const testDbPath = path.join(os.tmpdir(), `ramady_test_${Date.now()}.sqlite`);

async function runTests() {
  resetSqliteInstanceForTests(testDbPath);
  process.env.CRON_SECRET = 'test-cron-secret-key';

  const app = await createAppServer();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ [${passed}] ${name}`);
    } catch (err) {
      console.error(`✗ FAILED: ${name}`);
      throw err;
    }
  }

  async function api(
    endpoint: string,
    opts: {
      method?: string;
      body?: unknown;
      token?: string;
      adminToken?: string;
      formData?: FormData;
      headers?: Record<string, string>;
    } = {}
  ) {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.token) headers['x-student-token'] = opts.token;
    if (opts.adminToken) headers['x-admin-token'] = opts.adminToken;

    let body: BodyInit | undefined;
    if (opts.formData) {
      body = opts.formData;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: opts.method || 'GET',
      headers,
      body,
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // 1. Landing & Health
    await step('Health check and public landing API return 4 isolated grades', async () => {
      const h = await api('/api/health');
      assert.equal(h.status, 200);
      assert.equal(h.data.ok, true);

      const landing = await api('/api/landing');
      assert.equal(landing.status, 200);
      assert.equal(landing.data.grades.length, 4);
      assert.deepEqual(
        landing.data.grades.map((g: { name_ar: string }) => g.name_ar),
        ['الصف الثالث الإعدادي', 'الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي']
      );
    });

    // 2. Student Registration & Exact Duplicate Prevention
    let s1Token = '';
    let s1Id = '';
    let s2Token = '';
    let s2Id = '';
    let sGrade2Token = '';

    await step('Student registration succeeds and duplicate normalized Arabic name or phone is blocked', async () => {
      const reg1 = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد أحمد علي محمود',
          phoneNumber: '01012345678',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(reg1.status, 201);
      s1Token = reg1.data.token;
      s1Id = reg1.data.student.id;
      assert.ok(s1Token);

      // Duplicate name with extra spaces & alef hamza normalization
      const dupName = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد  احمد علي محمود',
          phoneNumber: '01099998888',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(dupName.status, 409);
      assert.equal(dupName.data.error, 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');

      // Duplicate name with tatweel, zero-width directional marks & Ta-Marbuta/Alif-Maqsura variants
      const dupStealth = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمـد\u200F  أحمد   على\u200B  محمود',
          phoneNumber: '01099997777',
          gradeId: 2,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(dupStealth.status, 409);
      assert.equal(dupStealth.data.error, 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');

      // Digits/symbols in quad name must be rejected
      const badDigitsName = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد أحمد علي 2',
          phoneNumber: '01099996666',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(badDigitsName.status, 400);

      // Repeated same word inside quad name must be rejected (400)
      const repeatedWordName = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد محمد محمد محمد',
          phoneNumber: '01099995555',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(repeatedWordName.status, 400);

      const twoDistinctWordsName = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد نصر محمد نصر',
          phoneNumber: '01099994444',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(twoDistinctWordsName.status, 400);

      // Persian/Urdu keyboard lookalike characters must map to existing Arabic student (409)
      const dupPersianKeyboard = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'محمد أحمد على محمود'.replace(/ي/g, 'ی'),
          phoneNumber: '01099993333',
          gradeId: 2,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(dupPersianKeyboard.status, 409);
      assert.equal(dupPersianKeyboard.data.error, 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');

      // Duplicate compound spacing check (عبد الله vs عبدالله across different accounts)
      const regCompound = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'عبد الله طارق سعيد حسن',
          phoneNumber: '01088887777',
          gradeId: 3,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(regCompound.status, 201);

      const dupCompound = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'عبدالله طارق سعيد حسن',
          phoneNumber: '01088886666',
          gradeId: 4,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(dupCompound.status, 409);
      assert.equal(dupCompound.data.error, 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');

      // Clean up temporary compound account so subsequent student count assertions stay at 3
      getSqliteDb().prepare('DELETE FROM students WHERE id = ?').run(regCompound.data.student.id);

      // Duplicate phone with +20 prefix normalization
      const dupPhone = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'خالد إبراهيم حسن سعيد',
          phoneNumber: '+201012345678',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(dupPhone.status, 409);
      assert.equal(dupPhone.data.error, 'رقم الهاتف مسجل بالفعل.');

      // Register second student in Grade 1 & one student in Grade 2
      const reg2 = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'يوسف كريم طارق نبيل',
          phoneNumber: '01122334455',
          gradeId: 1,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(reg2.status, 201);
      s2Token = reg2.data.token;
      s2Id = reg2.data.student.id;

      const regG2 = await api('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'سارة مصطفى عادل فؤاد',
          phoneNumber: '01233445566',
          gradeId: 2,
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      });
      assert.equal(regG2.status, 201);
      sGrade2Token = regG2.data.token;
    });

    // 3. Multi-device login & session persistence
    await step('Student can log in concurrently from two devices and keep both sessions active', async () => {
      const loginA = await api('/api/auth/login', {
        method: 'POST',
        body: { fullName: 'محمد أحمد علي محمود', password: 'Password123' },
      });
      const loginB = await api('/api/auth/login', {
        method: 'POST',
        body: { fullName: 'محمد أحمد علي محمود', password: 'Password123' },
      });
      assert.equal(loginA.status, 200);
      assert.equal(loginB.status, 200);
      assert.notEqual(loginA.data.token, loginB.data.token);

      const meA = await api('/api/auth/me', { token: loginA.data.token });
      const meB = await api('/api/auth/me', { token: loginB.data.token });
      assert.equal(meA.data.student.id, s1Id);
      assert.equal(meB.data.student.id, s1Id);
      s1Token = loginB.data.token;
    });

    // 4. RBAC Enforcement & Admin Gate Setup + Login
    let adminToken = '';
    await step('RBAC blocks student/anonymous from admin routes and validates Admin Gate setup & passcode', async () => {
      const unauthAdmin = await api('/api/admin/overview');
      assert.equal(unauthAdmin.status, 401);

      const studentToAdmin = await api('/api/admin/overview', { token: s1Token });
      assert.equal(studentToAdmin.status, 401);

      const initStatus = await api('/api/auth/admin/status');
      assert.equal(initStatus.status, 200);
      assert.equal(initStatus.data.configured, false);

      const setupRes = await api('/api/auth/admin/setup', {
        method: 'POST',
        body: { passcode: 'TestAdminCode123', confirmPasscode: 'TestAdminCode123' },
      });
      assert.equal(setupRes.status, 201);

      const dupSetup = await api('/api/auth/admin/setup', {
        method: 'POST',
        body: { passcode: 'AnotherCode999', confirmPasscode: 'AnotherCode999' },
      });
      assert.equal(dupSetup.status, 409);

      const badAdminLogin = await api('/api/auth/admin/login', {
        method: 'POST',
        body: { passcode: '000000' },
      });
      assert.equal(badAdminLogin.status, 401);

      const goodAdminLogin = await api('/api/auth/admin/login', {
        method: 'POST',
        body: { passcode: 'TestAdminCode123' },
      });
      assert.equal(goodAdminLogin.status, 200);
      adminToken = goodAdminLogin.data.token;
      assert.ok(adminToken);

      const okOverview = await api('/api/admin/overview', { adminToken });
      assert.equal(okOverview.status, 200);
      assert.equal(okOverview.data.totals.students, 3);

      // Admin cannot rename Student 2 to collide with Student 1's normalized name
      const dupRename = await api(`/api/admin/students/${s2Id}`, {
        method: 'PATCH',
        adminToken,
        body: { fullName: 'محمـد احمد على محمود' },
      });
      assert.equal(dupRename.status, 409);
    });

    // 5. Teacher Password Reset & Forced Change on Next Login
    await step('Teacher sets new temporary password without exposing old password; student must change it', async () => {
      const resetRes = await api(`/api/admin/students/${s2Id}/reset-password`, {
        method: 'POST',
        adminToken,
        body: { autoGenerate: true },
      });
      assert.equal(resetRes.status, 200);
      assert.equal(resetRes.data.mustChangePassword, true);
      const tempPass = resetRes.data.temporaryPassword;
      assert.ok(tempPass && tempPass.length >= 6);

      // Old session revoked
      const oldSess = await api('/api/student/dashboard', { token: s2Token });
      assert.equal(oldSess.status, 401);

      // Login with temporary password
      const loginTemp = await api('/api/auth/login', {
        method: 'POST',
        body: { fullName: 'يوسف كريم طارق نبيل', password: tempPass },
      });
      assert.equal(loginTemp.status, 200);
      assert.equal(loginTemp.data.student.mustChangePassword, true);
      const tempToken = loginTemp.data.token;

      // Blocked from dashboard until changing password
      const blockedDash = await api('/api/student/dashboard', { token: tempToken });
      assert.equal(blockedDash.status, 403);
      assert.equal(blockedDash.data.mustChangePassword, true);

      // Change password
      const changeRes = await api('/api/auth/change-password', {
        method: 'POST',
        token: tempToken,
        body: { newPassword: 'NewStrongPass99', confirmPassword: 'NewStrongPass99' },
      });
      assert.equal(changeRes.status, 200);

      // Now dashboard succeeds
      const okDash = await api('/api/student/dashboard', { token: tempToken });
      assert.equal(okDash.status, 200);
      s2Token = tempToken;
    });

    // 6. Independent Exams (No Question Bank) + Start + No is_correct Leak + Auto-save + Resume
    let exam1Id = '';
    let exam2Id = '';
    let exam1Questions: Array<{ id: string; options: Array<{ id: string; option_text: string }> }> = [];

    await step('Teacher creates independent exams; student starts attempt without seeing is_correct, auto-saves & resumes', async () => {
      const createEx1 = await api('/api/admin/exams', {
        method: 'POST',
        adminToken,
        body: {
          gradeId: 1,
          title: 'امتحان النحو الأول',
          description: 'اختبار مستقل في المبتدأ والخبر',
          unitTitle: 'الوحدة الأولى',
          lessonTitle: 'الجملة الاسمية',
          pointsPerQuestion: 50,
          durationMinutes: 15,
          maxAttempts: 1,
          publishMode: 'now',
          questions: [
            {
              questionText: 'ما إعراب «الطالب» في: الطالبُ مجتهدٌ؟',
              points: 50,
              options: [
                { optionText: 'مبتدأ مرفوع بالضمة', isCorrect: true },
                { optionText: 'فاعل مرفوع', isCorrect: false },
                { optionText: 'مفعول به', isCorrect: false },
              ],
            },
            {
              questionText: 'ما نوع الخبر في: العلمُ نورٌ؟',
              points: 50,
              options: [
                { optionText: 'خبر مفرد', isCorrect: true },
                { optionText: 'خبر جملة اسمية', isCorrect: false },
              ],
            },
          ],
        },
      });
      assert.equal(createEx1.status, 201);
      exam1Id = createEx1.data.exam.id;
      assert.equal(createEx1.data.exam.total_points, 100);

      // Second exam (100 points) to prove unbounded cumulative > 100 (total 200/200)
      const createEx2 = await api('/api/admin/exams', {
        method: 'POST',
        adminToken,
        body: {
          gradeId: 1,
          title: 'امتحان البلاغة الأول',
          unitTitle: 'الوحدة الثانية',
          lessonTitle: 'التشبيه',
          pointsPerQuestion: 100,
          durationMinutes: 15,
          maxAttempts: 1,
          publishMode: 'now',
          questions: [
            {
              questionText: '«الجندي كالأسد» نوع الصورة البيانية:',
              points: 100,
              options: [
                { optionText: 'تشبيه', isCorrect: true },
                { optionText: 'طباق', isCorrect: false },
              ],
            },
          ],
        },
      });
      assert.equal(createEx2.status, 201);
      exam2Id = createEx2.data.exam.id;

      // Grade isolation: Grade 2 student CANNOT see or start Grade 1 exam
      const g2Exams = await api('/api/student/exams', { token: sGrade2Token });
      assert.equal(g2Exams.data.exams.length, 0);
      const g2Attempt = await api(`/api/student/exams/${exam1Id}/start`, {
        method: 'POST',
        token: sGrade2Token,
      });
      assert.equal(g2Attempt.status, 403);

      // Student 1 starts Exam 1
      const start1 = await api(`/api/student/exams/${exam1Id}/start`, {
        method: 'POST',
        token: s1Token,
      });
      assert.equal(start1.status, 200);
      exam1Questions = start1.data.questions;
      const attemptId = start1.data.attempt.id;

      // Ensure NO is_correct key is exposed anywhere in student questions
      for (const q of exam1Questions) {
        for (const opt of q.options) {
          assert.equal('is_correct' in opt, false);
          assert.equal('isCorrect' in opt, false);
        }
      }

      // Auto-save answer for Question 1
      const save1 = await api(`/api/student/attempts/${attemptId}/answer`, {
        method: 'POST',
        token: s1Token,
        body: {
          questionId: exam1Questions[0].id,
          selectedOptionId: exam1Questions[0].options[0].id,
        },
      });
      assert.equal(save1.status, 200);
      assert.equal(save1.data.saved, true);

      // Resume attempt on refresh/other device -> same attempt ID + saved answer restored
      const resume1 = await api(`/api/student/exams/${exam1Id}/start`, {
        method: 'POST',
        token: s1Token,
      });
      assert.equal(resume1.status, 200);
      assert.equal(resume1.data.attempt.id, attemptId);
      assert.equal(resume1.data.savedAnswers[exam1Questions[0].id], exam1Questions[0].options[0].id);

      // Save Question 2 and submit
      await api(`/api/student/attempts/${attemptId}/answer`, {
        method: 'POST',
        token: s1Token,
        body: {
          questionId: exam1Questions[1].id,
          selectedOptionId: exam1Questions[1].options[0].id,
        },
      });
      const submit1 = await api(`/api/student/attempts/${attemptId}/submit`, {
        method: 'POST',
        token: s1Token,
      });
      assert.equal(submit1.status, 200);
      assert.equal(submit1.data.result.earned_score, 100);
      assert.equal(submit1.data.result.max_score, 100);
      assert.equal(submit1.data.result.percentage, 100);

      // Max attempts = 1 blocks starting another attempt
      const retryBlocked = await api(`/api/student/exams/${exam1Id}/start`, {
        method: 'POST',
        token: s1Token,
      });
      assert.equal(retryBlocked.status, 403);
    });

    // 7. Server-side auto-expiry grading
    await step('Expired attempt is automatically graded as expired on server', async () => {
      const start2 = await api(`/api/student/exams/${exam1Id}/start`, {
        method: 'POST',
        token: s2Token,
      });
      assert.equal(start2.status, 200);
      const s2AttemptId = start2.data.attempt.id;
      const q1 = start2.data.questions[0];

      // Save 1 correct answer (50 pts)
      await api(`/api/student/attempts/${s2AttemptId}/answer`, {
        method: 'POST',
        token: s2Token,
        body: { questionId: q1.id, selectedOptionId: q1.options[0].id },
      });

      // Force attempt expiry in DB to simulate elapsed server timer
      const db = getSqliteDb();
      const pastIso = new Date(Date.now() - 10_000).toISOString();
      db.prepare('UPDATE exam_attempts SET expires_at = ? WHERE id = ?').run(pastIso, s2AttemptId);

      // Answering after expiry triggers auto-grading & returns expired: true
      const lateAnswer = await api(`/api/student/attempts/${s2AttemptId}/answer`, {
        method: 'POST',
        token: s2Token,
        body: { questionId: q1.id, selectedOptionId: q1.options[0].id },
      });
      assert.equal(lateAnswer.status, 200);
      assert.equal(lateAnswer.data.expired, true);

      const s2Results = await api('/api/student/results', { token: s2Token });
      assert.equal(s2Results.data.results.length, 1);
      assert.equal(s2Results.data.results[0].earned_score, 50);
    });

    // 8. Unbounded Cumulative Score (>100), No Zeros for Unattempted Exams, & Leaderboards
    await step('Unbounded cumulative total (200/200), no zeros for unattempted exams, and accurate leaderboards', async () => {
      // Student 1 takes Exam 2 (100 pts) -> cumulative becomes 200/200
      const startEx2 = await api(`/api/student/exams/${exam2Id}/start`, {
        method: 'POST',
        token: s1Token,
      });
      const q = startEx2.data.questions[0];
      await api(`/api/student/attempts/${startEx2.data.attempt.id}/answer`, {
        method: 'POST',
        token: s1Token,
        body: { questionId: q.id, selectedOptionId: q.options[0].id },
      });
      await api(`/api/student/attempts/${startEx2.data.attempt.id}/submit`, {
        method: 'POST',
        token: s1Token,
      });

      const s1Res = await api('/api/student/results', { token: s1Token });
      assert.equal(s1Res.data.stats.cumulativeEarned, 200);
      assert.equal(s1Res.data.stats.cumulativePossible, 200);
      assert.equal(s1Res.data.stats.percentage, 100);
      assert.equal(s1Res.data.stats.completedExams, 2);

      // Student 2 did NOT take Exam 2 -> max_score possible must ONLY be 100 (NO zero added for unattempted exam!)
      const s2Res = await api('/api/student/results', { token: s2Token });
      assert.equal(s2Res.data.stats.cumulativeEarned, 50);
      assert.equal(s2Res.data.stats.cumulativePossible, 100);
      assert.equal(s2Res.data.stats.completedExams, 1);

      // Leaderboard rank 1 is Student 1; Grade 2 leaderboard is empty
      const lbG1 = await api(`/api/student/leaderboard?examId=${exam1Id}`, { token: s1Token });
      assert.equal(lbG1.data.cumulativeBoard[0].studentId, s1Id);
      assert.equal(lbG1.data.cumulativeBoard[0].cumulativeEarned, 200);
      assert.equal(lbG1.data.examBoard[0].studentId, s1Id);

      const lbG2 = await api('/api/student/leaderboard', { token: sGrade2Token });
      assert.equal(lbG2.data.cumulativeBoard.length, 0);
    });

    // 9. Badges, Arabic PDF Certificate, Notifications, Analytics
    await step('Badges auto-awarded without duplicates, manual & auto Arabic PDF certificates download cleanly', async () => {
      const s1Badges = await api('/api/student/badges', { token: s1Token });
      const earned = s1Badges.data.badges.filter((b: { earned: boolean }) => b.earned);
      assert.ok(earned.length >= 2); // first_exam + perfect_score / excellence_90

      // Issue manual appreciation certificate
      const issueCert = await api('/api/admin/certificates/issue', {
        method: 'POST',
        adminToken,
        body: {
          studentId: s1Id,
          certType: 'appreciation',
          titleAr: 'شهادة تقدير ملك اللغة',
          reasonAr: 'التفوق المستمر في النحو والبلاغة والالتزام التام',
        },
      });
      assert.equal(issueCert.status, 201);
      const certId = issueCert.data.certificate.id;
      const certSerial = issueCert.data.certificate.serial_number;

      // Public certificate verification works by serial and returns 404 for fake serial
      const verifyOk = await api(`/api/public/certificates/verify/${encodeURIComponent(certSerial)}`);
      assert.equal(verifyOk.status, 200);
      assert.equal(verifyOk.data.valid, true);
      assert.equal(verifyOk.data.certificate.studentName, 'محمد أحمد علي محمود');

      const verifyMissing = await api('/api/public/certificates/verify/ARM-2026-00000000');
      assert.equal(verifyMissing.status, 404);
      assert.equal(verifyMissing.data.valid, false);

      // Download real Arabic PDF
      const pdfRes = await api(`/api/student/certificates/${certId}/pdf`, { token: s1Token });
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(pdfRes.data as ArrayBuffer);
      assert.ok(buf.subarray(0, 5).toString('ascii').startsWith('%PDF-'));
      assert.ok(buf.byteLength > 10_000);

      // Student analytics reflects actual exams & weak/strong units
      const analyticsRes = await api('/api/student/analytics', { token: s1Token });
      assert.equal(analyticsRes.status, 200);
      assert.equal(analyticsRes.data.analytics.totalCompletedAttempts, 2);
      assert.equal(analyticsRes.data.analytics.lessonBreakdown.length, 2);

      // Issue remaining certificate types (achievement & appreciation) and verify all 5 distinct PDF templates render
      const issueAchieve = await api('/api/admin/certificates/issue', {
        method: 'POST',
        adminToken,
        body: {
          studentId: s1Id,
          certType: 'achievement',
          titleAr: 'شهادة إنجاز رسمية',
          reasonAr: 'اجتياز المسار التدريبي الكامل بنجاح وتفوق واضح',
        },
      });
      assert.equal(issueAchieve.status, 201);

      const issueTop = await api('/api/admin/certificates/issue', {
        method: 'POST',
        adminToken,
        body: {
          studentId: s1Id,
          certType: 'top_of_grade',
          titleAr: 'وسام المركز الأول على الصف',
          reasonAr: 'تصدر الترتيب التراكمي للصف الثالث الإعدادي بجدارة واستحقاق',
        },
      });
      assert.equal(issueTop.status, 201);

      const s1CertsRes = await api('/api/student/certificates', { token: s1Token });
      assert.equal(s1CertsRes.status, 200);
      const distinctPdfSizes = new Set<number>();
      for (const c of s1CertsRes.data.certificates as Array<{ id: string }>) {
        const cPdf = await api(`/api/student/certificates/${c.id}/pdf`, { token: s1Token });
        assert.equal(cPdf.status, 200);
        const cBuf = Buffer.from(cPdf.data as ArrayBuffer);
        assert.ok(cBuf.subarray(0, 5).toString('ascii').startsWith('%PDF-'));
        assert.ok(cBuf.byteLength > 10_000);
        distinctPdfSizes.add(cBuf.byteLength);
      }
      assert.ok(distinctPdfSizes.size >= 4);

      // Grade-targeted notification
      await api('/api/admin/notifications', {
        method: 'POST',
        adminToken,
        body: { gradeId: 1, titleAr: 'تنبيه للصف الثالث الإعدادي', bodyAr: 'مراجعة شاملة غدًا' },
      });
      const g1Notifs = await api('/api/student/notifications', { token: s1Token });
      const g2Notifs = await api('/api/student/notifications', { token: sGrade2Token });
      assert.ok(g1Notifs.data.notifications.some((n: { title_ar: string }) => n.title_ar === 'تنبيه للصف الثالث الإعدادي'));
      assert.equal(
        g2Notifs.data.notifications.some((n: { title_ar: string }) => n.title_ar === 'تنبيه للصف الثالث الإعدادي'),
        false
      );
    });

    // 10. Direct Video Upload + Range Playback + Scheduled Publication Worker
    await step('Direct video upload supports HTTP Range playback and scheduled publications trigger without browser', async () => {
      const form = new FormData();
      const fakeMp4 = new Blob([Buffer.alloc(2048, 0x41)], { type: 'video/mp4' });
      form.append('video', fakeMp4, 'lesson-intro.mp4');
      form.append('gradeId', '1');
      form.append('unitTitle', 'الوحدة الأولى');
      form.append('lessonTitle', 'الدرس الأول');
      form.append('title', 'شرح المبتدأ والخبر');
      form.append('description', 'شرح تفصيلي بالأمثلة');
      form.append('publishMode', 'scheduled');
      // Due 2 seconds ago so cron publishes it immediately
      form.append('scheduledFor', new Date(Date.now() - 2000).toISOString());
      form.append('timezone', 'Africa/Cairo');

      const uploadRes = await api('/api/admin/videos', {
        method: 'POST',
        adminToken,
        formData: form,
      });
      assert.equal(uploadRes.status, 201);
      const vidId = uploadRes.data.video.id;
      assert.equal(uploadRes.data.video.publish_status, 'scheduled');

      // Student cannot see scheduled video before publication
      const beforePub = await api('/api/student/videos', { token: s1Token });
      assert.equal(beforePub.data.videos.length, 0);

      // Run server-side scheduler directly (no browser open)
      const pubOut = await runDuePublicationsOnce();
      assert.equal(pubOut.processed, 1);

      // Now Grade 1 student sees it, Grade 2 does not
      const afterPubG1 = await api('/api/student/videos', { token: s1Token });
      assert.equal(afterPubG1.data.videos.length, 1);
      const afterPubG2 = await api('/api/student/videos', { token: sGrade2Token });
      assert.equal(afterPubG2.data.videos.length, 0);

      // Watch video + media auth + grade isolation + Range request 206
      const watchRes = await api(`/api/student/videos/${vidId}`, { token: s1Token });
      assert.equal(watchRes.status, 200);
      const playbackUrl: string = watchRes.data.video.playbackUrl;

      const unauthMedia = await fetch(`${baseUrl}${playbackUrl}`);
      assert.equal(unauthMedia.status, 401);

      const wrongGradeMedia = await fetch(`${baseUrl}${playbackUrl}`, {
        headers: { 'x-student-token': sGrade2Token },
      });
      assert.equal(wrongGradeMedia.status, 403);

      const rangeRes = await fetch(`${baseUrl}${playbackUrl}`, {
        headers: { Range: 'bytes=0-511', 'x-student-token': s1Token },
      });
      assert.equal(rangeRes.status, 206);
      assert.equal(rangeRes.headers.get('content-range'), 'bytes 0-511/2048');

      // Delete test video so no stray test media remains on disk
      const delVid = await api(`/api/admin/videos/${vidId}`, {
        method: 'DELETE',
        adminToken,
      });
      assert.equal(delVid.status, 200);
    });

    // 11. Unlimited Free External Video Link (YouTube / Google Drive) + Auto Thumbnail + Grade Isolation
    await step('Free unlimited YouTube video link auto-derives thumbnail and isolates grades', async () => {
      const form = new FormData();
      form.append('gradeId', '1');
      form.append('unitTitle', 'الوحدة الثانية');
      form.append('lessonTitle', 'البلاغة');
      form.append('title', 'مراجعة البلاغة الشاملة');
      form.append('description', 'شرح سحابي مجاني بلا حدود');
      form.append('publishMode', 'now');
      form.append('videoUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      const linkRes = await api('/api/admin/videos', {
        method: 'POST',
        adminToken,
        formData: form,
      });
      assert.equal(linkRes.status, 201);
      const linkVidId = linkRes.data.video.id;
      assert.equal(linkRes.data.video.publish_status, 'published');
      assert.equal(linkRes.data.video.file_size_bytes, null);

      const g1Videos = await api('/api/student/videos', { token: s1Token });
      assert.equal(g1Videos.data.videos.length, 1);
      assert.equal(
        g1Videos.data.videos[0].thumbnailUrl,
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      );

      const g2Videos = await api('/api/student/videos', { token: sGrade2Token });
      assert.equal(g2Videos.data.videos.length, 0);

      const delLinkVid = await api(`/api/admin/videos/${linkVidId}`, {
        method: 'DELETE',
        adminToken,
      });
      assert.equal(delLinkVid.status, 200);

      // Google Drive URL format parsing check
      assert.equal(
        extractGoogleDriveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing'),
        '1AbCdEfGhIjKlMnOpQrStUvWxYz'
      );
      assert.equal(
        extractGoogleDriveId('https://drive.google.com/file/u/0/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview'),
        '1AbCdEfGhIjKlMnOpQrStUvWxYz'
      );
      assert.equal(
        extractGoogleDriveId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz'),
        '1AbCdEfGhIjKlMnOpQrStUvWxYz'
      );
      assert.equal(
        extractGoogleDriveId('https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUvWxYz'),
        '1AbCdEfGhIjKlMnOpQrStUvWxYz'
      );
    });

    // 12. Admin Logout Locks Session Requiring Passcode Again
    await step('Leaving/logging out of Admin Room revokes session and blocks re-access until passcode re-entry', async () => {
      const logoutRes = await api('/api/auth/admin/logout', {
        method: 'POST',
        adminToken,
      });
      assert.equal(logoutRes.status, 200);

      const lockedRes = await api('/api/admin/overview', { adminToken });
      assert.ok(lockedRes.status === 401 || lockedRes.status === 403);

      const reLogin = await api('/api/auth/admin/login', {
        method: 'POST',
        body: { passcode: 'TestAdminCode123' },
      });
      assert.equal(reLogin.status, 200);
      adminToken = reLogin.data.token;
      const okAgain = await api('/api/admin/overview', { adminToken });
      assert.equal(okAgain.status, 200);
    });

    // 13. High-Concurrency Burst Resilience (40 parallel read/write requests)
    await step('High-concurrency burst of parallel landing, dashboard, and exam answer writes succeeds cleanly', async () => {
      // Create an active exam with 2 questions to stress parallel start + answer writes
      const burstExam = await api('/api/admin/exams', {
        method: 'POST',
        adminToken,
        body: {
          gradeId: 2,
          title: 'اختبار الضغط المتزامن',
          unitTitle: 'الوحدة الأولى',
          lessonTitle: 'التدريب الشامل',
          pointsPerQuestion: 25,
          durationMinutes: 20,
          maxAttempts: 1,
          publishMode: 'now',
          questions: [
            {
              questionText: 'سؤال اختبار التزامن الأول',
              points: 25,
              options: [
                { optionText: 'إجابة أ', isCorrect: true },
                { optionText: 'إجابة ب', isCorrect: false },
              ],
            },
            {
              questionText: 'سؤال اختبار التزامن الثاني',
              points: 25,
              options: [
                { optionText: 'إجابة ج', isCorrect: true },
                { optionText: 'إجابة د', isCorrect: false },
              ],
            },
          ],
        },
      });
      assert.equal(burstExam.status, 201);

      const startBurst = await api(`/api/student/exams/${burstExam.data.exam.id}/start`, {
        method: 'POST',
        token: sGrade2Token,
      });
      assert.equal(startBurst.status, 200);
      const bAttemptId = startBurst.data.attempt.id;
      const bQuestions = startBurst.data.questions;

      const burstPromises: Array<Promise<{ status: number }>> = [];
      for (let i = 0; i < 20; i++) {
        burstPromises.push(api('/api/public/landing'));
      }
      for (let i = 0; i < 10; i++) {
        burstPromises.push(api('/api/student/dashboard', { token: s1Token }));
      }
      for (let i = 0; i < 10; i++) {
        const q = bQuestions[i % 2];
        burstPromises.push(
          api(`/api/student/attempts/${bAttemptId}/answer`, {
            method: 'POST',
            token: sGrade2Token,
            body: { questionId: q.id, selectedOptionId: q.options[0].id },
          })
        );
      }

      const burstResults = await Promise.all(burstPromises);
      for (const r of burstResults) {
        assert.equal(r.status, 200);
      }

      const submitBurst = await api(`/api/student/attempts/${bAttemptId}/submit`, {
        method: 'POST',
        token: sGrade2Token,
      });
      assert.equal(submitBurst.status, 200);
      assert.equal(submitBurst.data.result.earned_score, 50);
    });

    // 14. Pagination, Cookie Transport Adaptation (HTTP vs HTTPS), and Shared-NAT Resilience
    await step('Admin pagination, HTTP/HTTPS Set-Cookie behavior, and shared-NAT multi-student auth succeed cleanly', async () => {
      const page1 = await api('/api/admin/students?page=1&pageSize=2', { adminToken });
      assert.equal(page1.status, 200);
      assert.equal(page1.data.students.length, 2);
      assert.equal(page1.data.total, 3);

      // Plain HTTP omits Secure; proxied HTTPS includes Secure; SameSite=None; Partitioned
      const httpLogin = await api('/api/auth/login', {
        method: 'POST',
        body: { fullName: 'محمد أحمد علي محمود', password: 'Password123' },
      });
      assert.equal(httpLogin.status, 200);
      const httpCookie = httpLogin.headers.get('set-cookie') || '';
      assert.ok(httpCookie.includes('HttpOnly'));
      assert.equal(httpCookie.includes('Secure'), false);

      const httpsLogin = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-proto': 'https' },
        body: { fullName: 'محمد أحمد علي محمود', password: 'Password123' },
      });
      assert.equal(httpsLogin.status, 200);
      const httpsCookie = httpsLogin.headers.get('set-cookie') || '';
      assert.ok(httpsCookie.includes('Secure'));
      assert.ok(httpsCookie.includes('SameSite=None'));
      assert.ok(httpsCookie.includes('Partitioned'));

      // Shared NAT test: 30 distinct logins/registrations from same IP do NOT trigger 429
      const firstNames = ['إبراهيم', 'حسين', 'طارق', 'ياسر', 'أشرف', 'مصطفى', 'كريم', 'هيثم', 'ماجد', 'رامي', 'شريف', 'تامر', 'عادل', 'حسام', 'وليد'];
      for (let i = 0; i < firstNames.length; i++) {
        const name = `${firstNames[i]} محمود سعيد عبدالحميد`;
        const phone = `015555500${String(i).padStart(2, '0')}`;
        const reg = await api('/api/auth/register', {
          method: 'POST',
          body: {
            fullName: name,
            phoneNumber: phone,
            gradeId: (i % 4) + 1,
            password: 'NatUserPass123',
            confirmPassword: 'NatUserPass123',
          },
        });
        assert.equal(reg.status, 201);
      }
    });

    console.log(`\nALL ${passed} INTEGRATION TEST SUITES PASSED SUCCESSFULLY.`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {
      // ignore cleanup
    }
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
